import {
    tisch,
    findIndexByTableNumber,
    reservationsByTable,
    sortTischArrayNr
} from "../core/state.js";
import { printTischArray, setSelectedTableNr, renderReservationsForSelectedTable } from "../ui/tableView.js";

const POSITION_OPTIONS = ["standing", "left", "middle", "right"];
const POSITION_LABELS = {
    standing: "Stehend",
    left: "Links",
    middle: "Mitte",
    right: "Rechts"
};

const GANG_OPTIONS = ["", "oben", "rechts", "unten", "links"];
const GANG_LABELS = {
    "": "—",
    oben: "Oben",
    rechts: "Rechts",
    unten: "Unten",
    links: "Links"
};

let seatsModalInitialized = false;
let seatsModalEscHandler = null;
let seatsModalTrigger = null;
let seatsModalDraft = null;

function cloneTableRows(list) {
    return list.map(entry => {
        if (!Array.isArray(entry)) {
            return entry;
        }
        const [nr, seats, position, gang] = entry;
        return [nr, seats, position, gang ?? null];
    });
}

function getActiveTablesForModal() {
    return Array.isArray(seatsModalDraft) ? seatsModalDraft : tisch;
}

/** kleinste freie positive Tischnummer (1,2,3, … Lücken werden gefüllt) */
function findNextAvailableTableNumber(source = getActiveTablesForModal()) {
    const used = new Set(source.map(([n]) => n));
    let n = 1;
    while (used.has(n)) n++;
    return n;
}

/** häufigster Sitzplatzwert als Standard (Fallback: 18) */
function getMostCommonSeats(source = getActiveTablesForModal()) {
    if (!source.length) return 18;
    const counts = new Map();
    for (const [, seats] of source) counts.set(seats, (counts.get(seats) || 0) + 1);
    let bestSeats = 18, bestCount = -1;
    for (const [seats, cnt] of counts.entries()) {
        if (cnt > bestCount) { bestCount = cnt; bestSeats = seats; }
    }
    return Number.isInteger(bestSeats) ? bestSeats : 18;
}

/** Nächstmöglichen Tisch automatisch hinzufügen (ohne Prompt) */
export function tischHinzufuegen() {
    if (isSeatsModalOpen()) {
        if (!syncDraftFromInputs()) {
            return;
        }
        const draft = getActiveTablesForModal();
        const nr = findNextAvailableTableNumber(draft);
        const seats = getMostCommonSeats(draft);
        draft.push([nr, seats, "middle", null]);
        sortTischArrayNr(draft);
        renderSeatsModalRows(nr);
        console.log("[TABLES] (Modal) Tisch hinzugefügt:", { nr, seats });
        return;
    }

    const nr = findNextAvailableTableNumber(tisch);
    const seats = getMostCommonSeats(tisch);

    tisch.push([nr, seats, "middle", null]);
    sortTischArrayNr(tisch);
    if (!reservationsByTable[nr]) reservationsByTable[nr] = [];

    printTischArray(tisch);
    setSelectedTableNr(nr);

    console.log("[TABLES] Tisch hinzugefügt:", { nr, seats });
}

/** Letzten (höchsten) Tisch entfernen. Falls Reservierungen vorhanden: Sicherheitsabfrage. */
export function tischEntfernen() {
    if (isSeatsModalOpen()) {
        if (!syncDraftFromInputs()) {
            return;
        }
        const draft = getActiveTablesForModal();
        if (!draft.length) {
            alert("Es gibt keine Tische zu entfernen.");
            return;
        }
        const maxNr = Math.max(...draft.map(([n]) => n));
        const idx = draft.findIndex(([n]) => n === maxNr);
        if (idx < 0) {
            return;
        }
        const resCount = (reservationsByTable[maxNr]?.length) || 0;
        if (resCount > 0) {
            const ok = confirm(`Am Tisch ${maxNr} existieren ${resCount} Reservierung(en). Wirklich entfernen? Diese Reservierungen gehen verloren.`);
            if (!ok) {
                return;
            }
        }
        draft.splice(idx, 1);
        renderSeatsModalRows();
        console.log("[TABLES] (Modal) Tisch entfernt:", { removed: maxNr });
        return;
    }

    if (!tisch.length) {
        alert("Es gibt keine Tische zu entfernen.");
        return;
    }

    // Höchste Tischnummer finden
    const maxNr = Math.max(...tisch.map(([n]) => n));
    const idx = findIndexByTableNumber(maxNr);
    if (idx < 0) return;

    const resCount = (reservationsByTable[maxNr]?.length) || 0;
    if (resCount > 0) {
        const ok = confirm(`Am Tisch ${maxNr} existieren ${resCount} Reservierung(en). Wirklich entfernen? Diese Reservierungen gehen verloren.`);
        if (!ok) return;
    }

    // Entfernen
    tisch.splice(idx, 1);
    delete reservationsByTable[maxNr];

    printTischArray(tisch);

    // Neue Auswahl: auf den neuen höchsten Tisch springen (falls vorhanden)
    if (tisch.length) {
        const newMax = Math.max(...tisch.map(([n]) => n));
        setSelectedTableNr(newMax);
    } else {
        // Keine Tische mehr → Tabelle leeren
        renderReservationsForSelectedTable();
    }

    console.log("[TABLES] Tisch entfernt:", { removed: maxNr });
}

function ensureSeatsModal() {
    if (seatsModalInitialized) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div id="tableSeatsModal" class="modal modal--xl hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="tableSeatsModalTitle">
        <div class="modal__backdrop" data-action="close"></div>
        <div class="modal__dialog">
          <header class="modal__header">
            <h3 id="tableSeatsModalTitle">Tische & Sitzplätze bearbeiten</h3>
            <button type="button" class="modal__close" data-action="close" aria-label="Schließen">×</button>
          </header>
          <div class="modal__body">
            <p class="modal__hint">Passe die Sitzplatzanzahl sowie die Position und den angrenzenden Gang je Tisch an.</p>
            <div class="modal__table-scroll">
              <table class="table table--compact" id="tableSeatsModalTable">
                <thead>
                  <tr>
                    <th style="width:15%;">Tisch</th>
                    <th style="width:20%;">Sitzplätze</th>
                    <th style="width:30%;">Position</th>
                    <th style="width:35%;">Gang daneben</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          <footer class="modal__footer">
            <div class="modal__actions">
              <button type="button" class="btn btn--ghost" id="tableSeatsModalCancel">Abbrechen</button>
              <button type="button" class="btn" id="tableSeatsModalSave">Speichern</button>
            </div>
             <div class="modal__actions modal__actions--right">
              <button type="button" class="btn" id="btn-add-table">Tisch hinzufügen</button>
              <button type="button" class="btn btn--ghost" id="btn-remove-table">Tisch entfernen</button>
            </div>
          </footer>
        </div>
      </div>`;

    document.body.appendChild(wrapper.firstElementChild);

    const modal = document.getElementById("tableSeatsModal");
    const closeElements = modal.querySelectorAll('[data-action="close"], #tableSeatsModalCancel');
    closeElements.forEach(el => el.addEventListener("click", closeSeatsModal));
    document.getElementById("tableSeatsModalSave")?.addEventListener("click", onSeatsModalSave);
    modal.querySelector('#btn-add-table')?.addEventListener("click", tischHinzufuegen);
    modal.querySelector('#btn-remove-table')?.addEventListener("click", tischEntfernen);

    seatsModalInitialized = true;
}

function seatsModalRefs() {
    const modal = document.getElementById("tableSeatsModal");
    return {
        modal,
        tableBody: modal?.querySelector("tbody"),
        saveBtn: document.getElementById("tableSeatsModalSave")
    };
}

function openSeatsModal() {
    ensureSeatsModal();
    seatsModalDraft = cloneTableRows(tisch);
    sortTischArrayNr(seatsModalDraft);
    renderSeatsModalRows();
    const { modal } = seatsModalRefs();
    if (!modal) return;
    seatsModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    const firstInput = modal.querySelector("input, select");
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 0);
    }
    if (seatsModalEscHandler) {
        document.removeEventListener("keydown", seatsModalEscHandler);
    }
    seatsModalEscHandler = ev => {
        if (ev.key === "Escape") {
            ev.preventDefault();
            closeSeatsModal();
        }
    };
    document.addEventListener("keydown", seatsModalEscHandler);
}

function closeSeatsModal() {
    const { modal } = seatsModalRefs();
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    if (seatsModalEscHandler) {
        document.removeEventListener("keydown", seatsModalEscHandler);
        seatsModalEscHandler = null;
    }
    if (seatsModalTrigger && typeof seatsModalTrigger.focus === "function") {
        seatsModalTrigger.focus();
    }
    seatsModalTrigger = null;
    seatsModalDraft = null;
}

function onSeatsModalSave() {
    if (!syncDraftFromInputs()) {
        return;
    }

    const updated = cloneTableRows(seatsModalDraft);
    if (!updated.length) {
        alert("Keine Daten vorhanden.");
        return;
    }

    updated.sort((a, b) => a[0] - b[0]);

    const previousNumbers = new Set(tisch.map(([nr]) => nr));
    const nextNumbers = new Set(updated.map(([nr]) => nr));

    tisch.splice(0, tisch.length, ...updated);

    for (const nr of nextNumbers) {
        if (!reservationsByTable[nr]) {
            reservationsByTable[nr] = [];
        }
    }
    for (const nr of previousNumbers) {
        if (!nextNumbers.has(nr)) {
            delete reservationsByTable[nr];
        }
    }

    printTischArray(tisch);
    renderReservationsForSelectedTable();
    closeSeatsModal();
    console.log("[TABLES] Tische aktualisiert:", updated);
}

/** Plätze ändern (bestehend – bleibt erhalten) */
export function changePlätze() {
    openSeatsModal();
}

function isSeatsModalOpen() {
    const { modal } = seatsModalRefs();
    if (!modal) {
        return false;
    }
    return !modal.classList.contains("hidden");
}

function readModalTableRows() {
    const { tableBody } = seatsModalRefs();
    if (!tableBody) {
        return null;
    }

    const rows = Array.from(tableBody.querySelectorAll("tr"));
    const updated = [];

    for (const row of rows) {
        const nr = parseInt(row.dataset.nr, 10);
        if (!Number.isInteger(nr)) {
            continue;
        }
        const seatInput = row.querySelector(".tsm-seats");
        const posSelect = row.querySelector(".tsm-position");
        const GANGSelect = row.querySelector(".tsm-aisle");

        const seatsVal = parseInt(seatInput?.value, 10);
        if (!Number.isInteger(seatsVal) || seatsVal < 0) {
            alert(`Bitte eine gültige Sitzplatzanzahl für Tisch ${nr} eingeben.`);
            seatInput?.focus();
            return null;
        }

        const positionVal = posSelect?.value;
        if (!POSITION_OPTIONS.includes(positionVal)) {
            alert(`Bitte eine gültige Position für Tisch ${nr} wählen.`);
            posSelect?.focus();
            return null;
        }

        const GANGRaw = GANGSelect?.value ?? "";
        if (!GANG_OPTIONS.includes(GANGRaw)) {
            alert(`Bitte einen gültigen Gang für Tisch ${nr} wählen.`);
            GANGSelect?.focus();
            return null;
        }
        const GANGVal = GANGRaw === "" ? null : GANGRaw;

        updated.push([nr, seatsVal, positionVal, GANGVal]);
    }

    updated.sort((a, b) => a[0] - b[0]);
    return updated;
}

function syncDraftFromInputs() {
    const next = readModalTableRows();
    if (!next) {
        return false;
    }
    seatsModalDraft = next;
    return true;
}

function renderSeatsModalRows(focusNr = null) {
    const { tableBody } = seatsModalRefs();
    if (!tableBody) return;

    const source = getActiveTablesForModal();
    const rowsData = cloneTableRows(source).sort((a, b) => a[0] - b[0]);
    const rows = rowsData.map(([nr, seats, position, gang]) => {
        const label = nr === 0 ? "Stehplätze" : `Tisch ${nr}`;
        const defaultPosition = nr === 0 ? "standing" : "middle";
        const currentPosition = POSITION_OPTIONS.includes(position) ? position : defaultPosition;
        const posOptions = POSITION_OPTIONS.map(opt => {
            const selected = opt === currentPosition ? "selected" : "";
            const text = POSITION_LABELS[opt] || opt;
            return `<option value="${opt}" ${selected}>${text}</option>`;
        }).join("");
        const gangValue = typeof gang === "string" ? gang : "";
        const gangOptions = GANG_OPTIONS.map(value => {
            const selected = value === gangValue ? "selected" : "";
            const text = GANG_LABELS[value] || value || "—";
            return `<option value="${value}" ${selected}>${text}</option>`;
        }).join("");
        return `
      <tr data-nr="${nr}">
        <td>${label}</td>
        <td><input type="number" class="tsm-seats" value="${seats}" min="0"></td>
        <td>
          <select class="tsm-position">
            ${posOptions}
          </select>
        </td>
        <td>
          <select class="tsm-aisle">
            ${gangOptions}
          </select>
        </td>
      </tr>`;
    }).join("");

    tableBody.innerHTML = rows;

    if (focusNr != null) {
        const focusInput = tableBody.querySelector(`tr[data-nr="${focusNr}"] .tsm-seats`);
        focusInput?.focus();
        if (typeof HTMLInputElement !== "undefined" && focusInput instanceof HTMLInputElement) {
            focusInput.select();
        }
    }
}
