// Globales Buchungs-Suchmodal (Name/BookingID) mit Aktionen
// Spalten: Name (+ Booking-ID), Tisch, Plätze, Notizen, Aktionen

import {
    reservationsByTable, ensureBucket, escapeHtml, noteToHtml,
    getSeatsByTableNumber, setSeatsByTableNumber
} from "../core/state.js";
import { printTischArray, renderReservationsForSelectedTable, setSelectedTableNr } from "../ui/tableView.js";
import { openMoveModal } from "./modalMoveSwap.js";

let wired = false;

function ensureSearchModal() {
    let el = document.getElementById("bookingSearchModal");
    if (el) return el;

    const wrap = document.createElement("div");
    wrap.innerHTML = `
  <div id="bookingSearchModal" class="modal hidden modal--xl" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="bookingSearchTitle">
    <div class="modal__backdrop"></div>
    <div class="modal__dialog">
      <header class="modal__header">
        <h3 id="bookingSearchTitle">Buchungen suchen</h3>
        <button type="button" class="modal__close" id="bk-search-close" aria-label="Schließen">×</button>
      </header>
      <div class="modal__body">
        <div class="bk-search-bar" style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
          <input id="bk-search-input" type="search" placeholder="Suche nach Name oder Booking-ID (z. B. 'Müller' oder '007')" style="flex:1; padding:10px 12px; font-size:14px;">
          <button id="bk-search-clear" class="btn btn--ghost" type="button">Leeren</button>
        </div>
        <div class="table-wrap">
          <table class="table table--compact" id="bk-search-table" style="width:100%;">
            <thead>
              <tr>
                <th style="min-width:160px; text-align:left;">Name (+ Booking-ID)</th>
                <th style="width:110px;">Tisch</th>
                <th style="width:90px;">Plätze</th>
                <th>Notizen</th>
                <th style="width:460px;">Aktionen</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      <footer class="modal__footer">
        <div style="margin-left:auto;">
          <button class="btn btn--ghost" id="bk-search-cancel" type="button">Schließen</button>
        </div>
      </footer>
    </div>
  </div>`;
    document.body.appendChild(wrap.firstElementChild);
    return document.getElementById("bookingSearchModal");
}

// Datensatz für die Tabelle vorbereiten (flatten)
function collectRows() {
    const rows = [];
    for (const key of Object.keys(reservationsByTable)) {
        const tableNr = parseInt(key, 10);
        const list = reservationsByTable[tableNr] || [];
        for (const r of list) {
            rows.push({
                id: r.id,
                bookingId: String(r.bookingId ?? ""),
                name: String(r.name ?? ""),
                cards: parseInt(r.cards) || 0,
                notes: r.notes || "",
                sold: !!r.sold,
                tableNr
            });
        }
    }
    // Alphabetisch nach Namen (de, Groß/Klein egal)
    rows.sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
    return rows;
}

// Rendering der Tabelle (mit optionalem Filter)
function renderTable(filter = "") {
    const modal = document.getElementById("bookingSearchModal");
    if (!modal) return;
    const tbody = modal.querySelector("#bk-search-table tbody");
    if (!tbody) return;

    const q = (filter || "").trim().toLowerCase();
    const rows = collectRows().filter(r => {
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || String(r.bookingId).toLowerCase().includes(q);
    });

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:.7;">Keine passenden Buchungen gefunden.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const bid = r.bookingId || "—";
        const notesHtml = noteToHtml(r.notes);
        const soldClass = r.sold ? ' class="is-sold"' : "";
        const actions = r.sold
            ? `<button class="btn" data-action="unsold">Verkauf rückgängig</button>`
            : [
                `<button class="btn" data-action="edit">Bearbeiten</button>`,
                `<button class="btn" data-action="move">Verschieben</button>`,
                `<button class="btn" data-action="sold">Als verkauft markieren</button>`,
                `<button class="btn btn--ghost" data-action="delete">Löschen</button>`
            ].join(" ");

        return `
      <tr data-id="${r.id}" data-table="${r.tableNr}"${soldClass}>
        <td>
          ${escapeHtml(r.name)}
          <div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div>
        </td>
        <td>Tisch ${r.tableNr}</td>
        <td>${r.cards}</td>
        <td>${notesHtml}</td>
        <td class="actions" style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</td>
      </tr>`;
    }).join("");
}

function closeModal() {
    const el = document.getElementById("bookingSearchModal");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
}

function wire() {
    if (wired) return;
    const el = document.getElementById("bookingSearchModal");
    if (!el) return;

    const input = el.querySelector("#bk-search-input");
    const btnClear = el.querySelector("#bk-search-clear");
    const btnClose = el.querySelector("#bk-search-close");
    const btnCancel = el.querySelector("#bk-search-cancel");
    const tbody = el.querySelector("#bk-search-table tbody");

    // Suche
    input?.addEventListener("input", () => renderTable(input.value));
    btnClear?.addEventListener("click", () => { input.value = ""; renderTable(""); input.focus(); });

    // Schließen
    btnClose?.addEventListener("click", closeModal);
    btnCancel?.addEventListener("click", closeModal);
    el.addEventListener("click", e => {
        if (e.target === el || e.target.classList.contains("modal__backdrop")) closeModal();
    });
    document.addEventListener("keydown", e => {
        if (!el.classList.contains("hidden") && e.key === "Escape") closeModal();
    });

    // Aktionen (Delegation)
    tbody?.addEventListener("click", e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const tr = btn.closest("tr[data-id][data-table]");
        if (!tr) return;

        const action = btn.getAttribute("data-action");
        const id = tr.getAttribute("data-id");
        const tableNr = parseInt(tr.getAttribute("data-table"), 10);

        ensureBucket(tableNr);
        const list = reservationsByTable[tableNr] || [];
        const idx = list.findIndex(r => r.id === id);
        if (idx < 0) return;
        const rec = list[idx];

        if (action === "edit") {
            if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht bearbeitet werden.");
            const newCount = parseInt(prompt(`Kartenanzahl für "${rec.name}" an Tisch ${tableNr} ändern:`, rec.cards));
            if (!Number.isInteger(newCount) || newCount <= 0) return alert("Ungültige Anzahl.");
            const delta = newCount - rec.cards;
            if (delta !== 0) {
                const avail = getSeatsByTableNumber(tableNr) || 0;
                if (delta > 0 && avail < delta) return alert(`Nicht genug freie Plätze an Tisch ${tableNr}. Verfügbar: ${avail}`);
                setSeatsByTableNumber(tableNr, avail - delta);
                rec.cards = newCount;
            }
            printTischArray(); // aktualisiert auch Select/Infos
            renderReservationsForSelectedTable();
            renderTable(input?.value || "");
        }

        if (action === "move") {
            if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht verschoben werden.");
            closeModal();
            setSelectedTableNr(tableNr); // Kontext setzen
            openMoveModal(tableNr, id);
        }

        if (action === "sold") {
            rec.sold = true;
            renderTable(input?.value || "");
            renderReservationsForSelectedTable();
        }

        if (action === "unsold") {
            rec.sold = false;
            renderTable(input?.value || "");
            renderReservationsForSelectedTable();
        }

        if (action === "delete") {
            if (!confirm(`Reservierung von "${rec.name}" (${rec.cards} Karten, Tisch ${tableNr}) wirklich löschen?`)) return;
            const avail = getSeatsByTableNumber(tableNr) || 0;
            setSeatsByTableNumber(tableNr, avail + rec.cards);
            list.splice(idx, 1);
            printTischArray();
            renderReservationsForSelectedTable();
            renderTable(input?.value || "");
        }
    });

    wired = true;
}

export function openBookingSearchModal() {
    const el = ensureSearchModal();
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    wire();
    // initial render
    const input = el.querySelector("#bk-search-input");
    if (input) input.value = "";
    renderTable("");
    // Fokus auf Suche
    setTimeout(() => input?.focus(), 0);
}
