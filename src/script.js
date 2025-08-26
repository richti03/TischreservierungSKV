// ---------------------------------------------
// Tisch-Reservierung – Logik
// ---------------------------------------------

// Daten: [Tischnummer, verfügbare Plätze]
var tisch = [
    [1, 18], [2, 18], [3, 18], [4, 18], [5, 18], [6, 18], [7, 18],
    [8, 24], [9, 24], [10, 24], [11, 24],
    [12, 18], [13, 18], [14, 12], [15, 18], [16, 18], [17, 18]
];

var alleAktionen = "";
var alleExportCodes = "";

// Reservierungen pro Tisch: { [tischnr]: [{ id, bookingId, name, cards, notes, ts }] }
var reservationsByTable = {};

console.log("[INIT] App gestartet. Ausgangsdaten (Tische):", JSON.parse(JSON.stringify(tisch)));

// ---------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------

function sortTischArrayPlace(arr) { arr.sort((a, b) => b[1] - a[1]); }
function sortTischArrayNr(arr)    { arr.sort((a, b) => a[0] - b[0]); }

function findIndexByTableNumber(num) { return tisch.findIndex(([n]) => n === num); }
function getSeatsByTableNumber(num)  { const i = findIndexByTableNumber(num); return i >= 0 ? tisch[i][1] : null; }
function setSeatsByTableNumber(num, seats) { const i = findIndexByTableNumber(num); if (i >= 0) tisch[i][1] = seats; }

function ensureBucket(nr) { if (!reservationsByTable[nr]) reservationsByTable[nr] = []; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function genBookingId() { return "B" + uid(); }

function getSelectedTableNr() {
    var select = document.getElementById("table-select");
    return select ? parseInt(select.value) : NaN;
}
function setSelectedTableNr(nr) {
    var select = document.getElementById("table-select");
    if (!select) return;
    select.value = nr;
    updateFooter();
    renderReservationsForSelectedTable();
    console.log("[UI] Select auf Tisch gesetzt:", nr);
}

function getReservationTbody() { return document.querySelector('#reservationview table tbody'); }

function escapeHtml(str) {
    if (typeof str !== "string") return str;
    return str
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function noteToHtml(note) {
    if (!note) return "";
    return escapeHtml(normalizeWishNote(note)).replace(/\n/g, "<br>");
}

function normalizeWishNote(note) {
    if (!note) return "";
    // Alte Varianten in "Tischwunsch berücksichtigt (Tisch X)" oder ähnliches umwandeln
    const re = /tischwunsch.*?\(?tisch\s*(\d+)\)?/i;
    const m = note.match(re);
    if (m) return `Tischwunsch: Tisch ${m[1]}`;
    return note;
}

function fileTimestamp() {
    const d = new Date(), p = n => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    console.log("[DOWNLOAD] JSON ausgeliefert:", filename, data);
}

function pickJSONFile(cb) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const obj = JSON.parse(text);
            console.log("[UPLOAD] JSON geladen:", file.name, obj);
            cb(obj);
        } catch (e) {
            console.error("[UPLOAD] Fehlerhafte JSON:", e);
            alert("Ungültige oder beschädigte JSON-Datei.");
        }
    }, { once: true });
    input.click();
}

// ---------------------------------------------
// Darstellung: Tische (links), Select, Footer
// ---------------------------------------------

function printTischArray(arr) {
    sortTischArrayNr(arr);
    var output = "";
    for (var i = 0; i < arr.length; i++) {
        output += "Tisch " + arr[i][0] + ": " + arr[i][1] + " Plätze<br>";
    }
    var outEl = document.getElementById("tischAusgabe");
    if (outEl) outEl.innerHTML = output;

    renderTableSelect(); // Select neu aufbauen
    console.log("[UI] Tische neu gerendert.");
}

function renderTableSelect(preserveSelection = true) {
    sortTischArrayNr(tisch);
    var select = document.getElementById("table-select");
    if (!select) return;

    var prev = preserveSelection ? parseInt(select.value) : NaN;

    // reset
    select.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.textContent = "Bitte Tisch auswählen.";
    opt0.disabled = true;
    opt0.selected = isNaN(prev);
    select.appendChild(opt0);

    // Optionen
    for (var i = 0; i < tisch.length; i++) {
        var nr = tisch[i][0];
        var plaetze = tisch[i][1];

        var opt = document.createElement("option");
        opt.value = nr;
        opt.textContent = "Tisch " + nr + " (" + plaetze + " Plätze)";
        if (!isNaN(prev) && nr === prev) opt.selected = true;
        select.appendChild(opt);
    }

    updateFooter();
    renderReservationsForSelectedTable();
    console.log("[UI] Select neu aufgebaut. Ausgewählt:", select.value || "(keiner)");
}

function updateFooter() {
    var select = document.getElementById("table-select");
    var strong = document.getElementById("available-cards");
    if (!strong) return;
    var nr = select ? parseInt(select.value) : NaN;
    var val = getSeatsByTableNumber(nr);
    strong.textContent = Number.isInteger(val) ? val : "—";
}

// ---------------------------------------------
// Split-Info für Notizen: andere Tische derselben Buchung
// ---------------------------------------------

function buildSplitInfoText(bookingId, currentTable) {
    if (!bookingId) return "";
    const parts = [];
    for (const key of Object.keys(reservationsByTable)) {
        const tableNr = parseInt(key, 10);
        if (!Number.isInteger(tableNr) || tableNr === currentTable) continue;
        const arr = reservationsByTable[tableNr] || [];
        for (const r of arr) {
            if (r.bookingId === bookingId) {
                parts.push(`Tisch ${tableNr} (${r.cards})`);
            }
        }
    }
    if (parts.length === 0) return "";
    return `Weitere Plätze: ${parts.join(", ")}`;
}

// ---------------------------------------------
// Reservierungen unter der Tabelle rendern
// ---------------------------------------------

function renderReservationsForSelectedTable() {
    var nr = getSelectedTableNr();
    var tbody = getReservationTbody();
    if (!tbody) return;

    if (!Number.isInteger(nr)) {
        tbody.innerHTML = `<tr><td colspan="4">Bitte oben einen Tisch auswählen.</td></tr>`;
        return;
    }

    ensureBucket(nr);
    var list = reservationsByTable[nr];

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Keine Reservierungen für Tisch ${nr}.</td></tr>`;
        return;
    }

    var rows = list.map(r => {
        var ts = new Date(r.ts).toLocaleString();
        var baseNotes = noteToHtml(r.notes);
        var splitInfo = buildSplitInfoText(r.bookingId, nr);
        var splitInfoHtml = splitInfo ? `<div style="font-size:12px; opacity:.75;">${escapeHtml(splitInfo)}</div>` : "";
        return `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.name)}<div style="font-size:12px; opacity:.7;">${ts}</div></td>
        <td>${r.cards}</td>
        <td>${baseNotes}${splitInfoHtml}</td>
        <td class="actions">
          <button class="btn" data-action="edit"      data-id="${r.id}" title="Kartenanzahl ändern" aria-label="Bearbeiten">Bearbeiten</button>
          <button class="btn" data-action="note"      data-id="${r.id}" title="Notiz hinzufügen/ändern" aria-label="Notiz">Notiz</button>
          <button class="btn" data-action="move"      data-id="${r.id}" title="Buchung verschieben/tauschen" aria-label="Verschieben">Verschieben</button>
          <button class="btn btn--ghost" data-action="delete"    data-id="${r.id}" title="Buchung löschen" aria-label="Löschen">Löschen</button>
        </td>
      </tr>
    `;
    }).join("");

    tbody.innerHTML = rows;
}

// ---------------------------------------------
// CRUD: Tische
// ---------------------------------------------

function tischHinzufuegen() {
    var tnr = parseInt(prompt("Neue Tischnummer eingeben:"));
    if (!Number.isInteger(tnr) || tnr <= 0) { alert("Ungültige Tischnummer."); return; }

    var seats = parseInt(prompt("Sitzplatzanzahl für Tisch " + tnr + " eingeben:"));
    if (!Number.isInteger(seats) || seats < 0) { alert("Ungültige Sitzplatzanzahl."); return; }

    var idx = findIndexByTableNumber(tnr);
    if (idx >= 0) {
        if (!confirm("Tisch " + tnr + " existiert bereits. Plätze auf " + seats + " setzen?")) return;
        tisch[idx][1] = seats;
    } else {
        tisch.push([tnr, seats]);
    }

    printTischArray(tisch);
    setSelectedTableNr(tnr);
}

function tischEntfernen() {
    var tnr = parseInt(prompt("Welche Tischnummer soll entfernt werden?"));
    if (!Number.isInteger(tnr)) { alert("Ungültige Tischnummer."); return; }

    var idx = findIndexByTableNumber(tnr);
    if (idx < 0) { alert("Tisch " + tnr + " wurde nicht gefunden."); return; }

    if (!confirm("Tisch " + tnr + " wirklich entfernen?")) return;

    tisch.splice(idx, 1);
    delete reservationsByTable[tnr];

    printTischArray(tisch);
    renderReservationsForSelectedTable();
}

function changePlätze() {
    var tnr = parseInt(prompt("Bitte Tischnummer eingeben:"));
    var plaetze = parseInt(prompt("Bitte neue Sitzplatzanzahl eingeben:"));

    if (!Number.isInteger(tnr) || !Number.isInteger(plaetze)) {
        alert("Bitte gültige Zahlen eingeben.");
        return;
    }

    var idx = findIndexByTableNumber(tnr);
    if (idx >= 0) {
        tisch[idx][1] = plaetze;
    } else {
        alert("Tisch nicht gefunden!");
    }

    printTischArray(tisch);
    setSelectedTableNr(tnr);
}

// ---------------------------------------------
// Reservierungslogik (mit Tischwunsch: immer "Tischwunsch: Tisch X")
// ---------------------------------------------

function berechneReservierung() {
    var name = prompt("Bitte gib den Namen des Kunden ein:");
    var cards = prompt("Bitte gib die Anzahl der reservierten Karten an:");
    var cardsInt = parseInt(cards);

    // Tischwunsch (optional)
    var wishInput = prompt("Tischwunsch (optional): Tischnummer eingeben oder leer lassen:");
    var preferredNr = parseInt(wishInput);
    if (!Number.isInteger(preferredNr)) preferredNr = null;

    if (!name || !Number.isInteger(cardsInt) || cardsInt <= 0) {
        alert("Bitte gültige Angaben machen.");
        return;
    }

    sortTischArrayPlace(tisch);
    var usedTables = reservierteKarten(tisch, cardsInt, name, preferredNr);

    printTischArray(tisch);

    var now = new Date().toLocaleString();
    alleExportCodes += now + "\n" + berechneExportohneAusgabe() + "\n\n";

    if (Array.isArray(usedTables) && usedTables.length > 0) {
        setSelectedTableNr(usedTables[0]);
    } else {
        renderReservationsForSelectedTable();
    }
}

/**
 * Verteilt c Karten auf Tische (evtl. zuerst Wunsch-Tisch), reduziert freie Plätze
 * und legt Records (gemeinsame bookingId) an. Gibt verwendete Tische zurück.
 */
function reservierteKarten(t, c, n, preferredNr) {
    var rest = c;
    var usedTables = [];

    var now = new Date();
    var dateAndTime = now.toLocaleString();
    var iso = now.toISOString();
    var bookingId = genBookingId();

    function wishNoteText() {
        if (!Number.isInteger(preferredNr)) return "";
        return `Tischwunsch: Tisch ${preferredNr}`;
    }

    // Wunsch-Tisch zuerst
    if (Number.isInteger(preferredNr)) {
        var wIdx = findIndexByTableNumber(preferredNr);
        if (wIdx >= 0) {
            var wAvail = t[wIdx][1];
            if (wAvail > 0 && rest > 0) {
                var take = Math.min(wAvail, rest);
                t[wIdx][1] -= take;
                ensureBucket(preferredNr);
                reservationsByTable[preferredNr].push({ id: uid(), bookingId, name: n, cards: take, notes: wishNoteText(), ts: iso });
                usedTables.push(preferredNr);
                rest -= take;
            }
        }
    }

    if (rest > 0) {
        sortTischArrayPlace(t);
        var exactIdx = t.findIndex(row => row[1] === rest);
        if (exactIdx !== -1) {
            var exactTable = t[exactIdx][0];
            t[exactIdx][1] = 0;
            ensureBucket(exactTable);
            reservationsByTable[exactTable].push({ id: uid(), bookingId, name: n, cards: rest, notes: wishNoteText(), ts: iso });
            usedTables.push(exactTable);
            rest = 0;
        } else {
            var counter = 0;
            while (rest > 0 && counter < t.length) {
                var tableNr = t[counter][0];
                var avail = t[counter][1];
                if (avail <= 0) { counter++; continue; }

                if (avail < rest) {
                    t[counter][1] = 0;
                    ensureBucket(tableNr);
                    reservationsByTable[tableNr].push({ id: uid(), bookingId, name: n, cards: avail, notes: wishNoteText(), ts: iso });
                    usedTables.push(tableNr);
                    rest -= avail;
                } else {
                    t[counter][1] = avail - rest;
                    ensureBucket(tableNr);
                    reservationsByTable[tableNr].push({ id: uid(), bookingId, name: n, cards: rest, notes: wishNoteText(), ts: iso });
                    usedTables.push(tableNr);
                    rest = 0;
                }
                counter++;
            }
        }
    }

    var alertMessage = n + " - " + dateAndTime + "\n";
    for (var i = 0; i < usedTables.length; i++) {
        var tn = usedTables[i];
        var recs = (reservationsByTable[tn] || []).filter(r => r.bookingId === bookingId);
        var sum = recs.reduce((s, r) => s + (r.cards || 0), 0);
        alertMessage += "Tisch " + tn + ": " + sum + " Karten\n";
    }

    alert(alertMessage.trim());
    console.log("[BOOKING] Reservierung erfasst:", { name:n, gesamt:c, usedTables, bookingId });

    alleAktionen += alertMessage + "\n";
    return usedTables;
}

// ---------------------------------------------
// Export / Import – SITZPLÄTZE (JSON)
// ---------------------------------------------

function exportSeatsJSON() {
    sortTischArrayNr(tisch);
    const data = {
        version: 1,
        type: "seats",
        exportedAt: new Date().toISOString(),
        seats: tisch.map(([table, seats]) => ({ table, seats }))
    };
    downloadJSON(data, `sitze_${fileTimestamp()}.json`);
}

function importSeatsJSON() {
    pickJSONFile(obj => {
        let entries = [];
        if (Array.isArray(obj)) {
            entries = obj;
        } else if (obj && Array.isArray(obj.seats)) {
            entries = obj.seats;
        } else if (obj && typeof obj === "object") {
            for (const k of Object.keys(obj)) {
                if (/^\d+$/.test(k)) entries.push({ table: parseInt(k, 10), seats: obj[k] });
            }
        }

        if (entries.length === 0) {
            alert("Keine Sitzplatzdaten gefunden.");
            return;
        }

        for (const e of entries) {
            const nr = parseInt(e.table);
            const seats = parseInt(e.seats);
            if (!Number.isInteger(nr) || !Number.isInteger(seats)) continue;

            const idx = findIndexByTableNumber(nr);
            if (idx >= 0) tisch[idx][1] = seats; else tisch.push([nr, seats]);
        }

        printTischArray(tisch);
        updateFooter();
        renderReservationsForSelectedTable();
        console.log("[IMPORT] Sitzplätze importiert:", entries);
    });
}

// ---------------------------------------------
// Export / Import – RESERVIERUNGEN (JSON)
// ---------------------------------------------

function exportReservationsJSON() {
    const data = {
        version: 1,
        type: "reservations",
        exportedAt: new Date().toISOString(),
        reservationsByTable: reservationsByTable
    };
    downloadJSON(data, `reservierungen_${fileTimestamp()}.json`);
}

function importReservationsJSON() {
    pickJSONFile(obj => {
        const src = obj && (obj.reservationsByTable || obj);
        if (!src || typeof src !== "object") {
            alert("Ungültiges Format für Reservierungen.");
            return;
        }
        const next = {};
        for (const key of Object.keys(src)) {
            const nr = parseInt(key, 10);
            if (!Number.isInteger(nr)) continue;
            const arr = src[key];
            if (!Array.isArray(arr)) continue;
            next[nr] = arr.map(r => ({
                id: r.id || uid(),
                bookingId: r.bookingId || genBookingId(),
                name: String(r.name || "").trim(),
                cards: parseInt(r.cards) || 0,
                notes: typeof r.notes === "string" ? normalizeWishNote(r.notes) : "",
                ts: r.ts || new Date().toISOString()
            })).filter(r => r.name && r.cards > 0);
        }
        reservationsByTable = next;
        renderReservationsForSelectedTable();
        console.log("[IMPORT] Reservierungen importiert:", next);
    });
}

// ---------------------------------------------
// MODAL: Verschieben / Tauschen – mit PRÜFEN ➜ VORSCHAU ➜ AUSFÜHREN
// ---------------------------------------------

let moveState = {
    mode: "move",        // "move" | "swap"
    sourceNr: null,
    targetNr: null,
    preselectId: null,
    previewOk: false
};
let modalWired = false;

function ensureMoveModal() {
    let el = document.getElementById("moveModal");

    // Prüfen, ob alte Version ohne Prüfen/Vorschau im DOM ist
    let needsUpgrade = false;
    if (el) {
        const requiredIds = [
            "moveModalApply","moveModalCheck","mm-preview","mm-total-LR",
            "mm-target-select","mm-source-table","mm-target-table"
        ];
        needsUpgrade = requiredIds.some(id => !el.querySelector("#" + id));
    }

    // Alte Version entfernen oder ganz neu erstellen
    if (!el || needsUpgrade) {
        if (el) {
            console.warn("[MODAL] Alte Modal-Version gefunden – wird ersetzt.");
            el.remove();
        }
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `
    <div id="moveModal" class="modal hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="moveModalTitle">
      <div class="modal__backdrop"></div>
      <div class="modal__dialog">
        <header class="modal__header">
          <h3 id="moveModalTitle">Reservierung verschieben / tauschen</h3>
          <button type="button" class="modal__close" id="moveModalClose" aria-label="Schließen">×</button>
        </header>
        <div class="modal__body">
          <div class="modal__controls">
            <label><input type="radio" name="moveMode" value="move" checked> Verschieben</label>
            <label style="margin-left:8px;"><input type="radio" name="moveMode" value="swap"> Tauschen</label>
            <span id="mm-hint" class="mm-hint">Modus „Verschieben“: Ziel-Tisch braucht genügend freie Plätze.</span>
          </div>

          <div class="modal__grid">
            <section class="modal__col">
              <h4>Quelle: Tisch <span id="mm-source-nr">—</span></h4>
              <table class="table table--compact" id="mm-source-table">
                <thead>
                  <tr>
                    <th>Auswahl</th><th>Name</th><th>Karten</th><th>Notizen</th><th style="min-width:130px;">Zu verschiebende Karten</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </section>

            <section class="modal__col">
              <h4>Ziel:
                <select id="mm-target-select" style="margin-left:6px;"></select>
              </h4>
              <table class="table table--compact" id="mm-target-table">
                <thead>
                  <tr>
                    <th>Auswahl</th><th>Name</th><th>Karten</th><th>Notizen</th><th style="min-width:130px;">Zu verschiebende Karten</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </section>
          </div>

          <!-- Vorschau -->
          <div id="mm-preview" class="mm-preview" style="display:none;">
            <div class="mm-card" id="mm-prev-source">
              <h5>Quelle (Tisch <span id="mm-prev-src-nr">—</span>)</h5>
              <div class="mm-meta">
                <span class="badge">Frei alt: <span id="mm-prev-src-free-old">0</span></span>
                <span class="badge">Frei neu: <span id="mm-prev-src-free-new">0</span></span>
                <span class="badge badge--warn" id="mm-prev-src-warn" style="display:none;">Quelle könnte überbucht sein</span>
              </div>
            </div>
            <div class="mm-card" id="mm-prev-target">
              <h5>Ziel (Tisch <span id="mm-prev-tgt-nr">—</span>)</h5>
              <div class="mm-meta">
                <span class="badge">Frei alt: <span id="mm-prev-tgt-free-old">0</span></span>
                <span class="badge">Frei neu: <span id="mm-prev-tgt-free-new">0</span></span>
                <span class="badge badge--err" id="mm-prev-tgt-err" style="display:none;">Ziel wäre überbucht</span>
                <span class="badge badge--ok"  id="mm-prev-ok" style="display:none;">Prüfung OK</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="modal__footer">
          <div class="modal__totals">
            <span>Links → Rechts: <strong id="mm-total-LR">0</strong></span>
            <span class="swap-only"> | Rechts → Links: <strong id="mm-total-RL">0</strong></span>
          </div>
          <div class="modal__actions">
            <button class="btn btn--ghost" id="moveModalCancel" type="button">Abbrechen</button>
            <button class="btn" id="moveModalCheck" type="button">Prüfen</button>
            <button class="btn" id="moveModalApply" type="button" disabled>Ausführen</button>
          </div>
        </footer>
      </div>
    </div>`;
        document.body.appendChild(wrapper.firstElementChild);
        console.log("[MODAL] Modal (aktuelle Version) in DOM eingefügt.");
    }
    return true;
}

function getModalRefs() {
    const modalEl = document.getElementById("moveModal");
    return {
        modalEl,
        mmSourceT: document.getElementById("mm-source-table"),
        mmTargetT: document.getElementById("mm-target-table"),
        mmSourceNr: document.getElementById("mm-source-nr"),
        mmTargetSelect: document.getElementById("mm-target-select"),
        mmTotalLR: document.getElementById("mm-total-LR"),
        mmTotalRL: document.getElementById("mm-total-RL"),
        mmHint: document.getElementById("mm-hint"),
        btnClose: document.getElementById("moveModalClose"),
        btnCancel: document.getElementById("moveModalCancel"),
        btnApply: document.getElementById("moveModalApply"),
        btnCheck: document.getElementById("moveModalCheck"),
        // Preview refs
        mmPreview: document.getElementById("mm-preview"),
        prevSrcNr: document.getElementById("mm-prev-src-nr"),
        prevSrcFreeOld: document.getElementById("mm-prev-src-free-old"),
        prevSrcFreeNew: document.getElementById("mm-prev-src-free-new"),
        prevSrcWarn: document.getElementById("mm-prev-src-warn"),
        prevTgtNr: document.getElementById("mm-prev-tgt-nr"),
        prevTgtFreeOld: document.getElementById("mm-prev-tgt-free-old"),
        prevTgtFreeNew: document.getElementById("mm-prev-tgt-free-new"),
        prevTgtErr: document.getElementById("mm-prev-tgt-err"),
        prevOk: document.getElementById("mm-prev-ok"),
    };
}

function openMoveModal(sourceNr, preselectId) {
    console.log("[MODAL] openMoveModal()", { sourceNr, preselectId });
    ensureMoveModal();
    const refs = getModalRefs();

    moveState.mode = "move";
    moveState.sourceNr = sourceNr;
    moveState.targetNr = null;
    moveState.preselectId = preselectId;
    moveState.previewOk = false;

    if (refs.mmSourceNr) refs.mmSourceNr.textContent = sourceNr;
    refs.modalEl.classList.remove("modal--swap");
    if (refs.mmHint) refs.mmHint.textContent = 'Modus „Verschieben“: Ziel-Tisch braucht genügend freie Plätze.';

    // Radiobuttons
    const radios = refs.modalEl.querySelectorAll('input[name="moveMode"]');
    radios.forEach(r => r.checked = (r.value === "move"));

    // Ziel-Select befüllen
    if (refs.mmTargetSelect) {
        refs.mmTargetSelect.innerHTML = "";
        const opt0 = document.createElement("option");
        opt0.value = ""; opt0.textContent = "Bitte Ziel-Tisch wählen";
        refs.mmTargetSelect.appendChild(opt0);

        sortTischArrayNr(tisch);
        for (const [nr, seats] of tisch) {
            if (nr === sourceNr) continue;
            const opt = document.createElement("option");
            opt.value = nr;
            opt.textContent = `Tisch ${nr} (frei: ${seats})`;
            refs.mmTargetSelect.appendChild(opt);
        }
    }

    renderModalSourceTable();
    renderModalTargetTable();
    updateModalTotals();
    resetPreview();

    refs.modalEl.classList.remove("hidden");
    refs.modalEl.setAttribute("aria-hidden", "false");

    if (!modalWired) { wireModalEvents(); modalWired = true; }
}

function closeMoveModal() {
    const { modalEl } = getModalRefs();
    if (!modalEl) return;
    modalEl.classList.add("hidden");
    modalEl.setAttribute("aria-hidden", "true");
    console.log("[MODAL] geschlossen.");
}

function resetPreview() {
    const { mmPreview, btnApply, prevOk, prevTgtErr, prevSrcWarn } = getModalRefs();
    moveState.previewOk = false;
    if (btnApply) btnApply.disabled = true;
    if (mmPreview) mmPreview.style.display = "none";
    if (prevOk) prevOk.style.display = "none";
    if (prevTgtErr) prevTgtErr.style.display = "none";
    if (prevSrcWarn) prevSrcWarn.style.display = "none";
}

// Quelle rendern
function renderModalSourceTable() {
    const { mmSourceT } = getModalRefs();
    if (!mmSourceT) return;
    ensureBucket(moveState.sourceNr);
    const list = reservationsByTable[moveState.sourceNr];

    const rows = list.map(r => {
        const checked = (r.id === moveState.preselectId) ? "checked" : "";
        const disabled = checked ? "" : "disabled";
        return `
      <tr data-id="${r.id}">
        <td><input type="checkbox" class="mm-src-check" ${checked}></td>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.cards}</td>
        <td>${noteToHtml(r.notes)}</td>
        <td><input type="number" class="mm-src-amt" min="1" max="${r.cards}" value="${r.cards}" ${disabled}></td>
      </tr>
    `;
    }).join("");

    mmSourceT.querySelector("tbody").innerHTML = rows;
    console.log("[MODAL] Quelle gerendert. Einträge:", list.length);
}

// Ziel rendern
function renderModalTargetTable() {
    const { mmTargetT, mmTargetSelect, modalEl } = getModalRefs();
    if (!mmTargetT) return;

    const targetNr = parseInt(mmTargetSelect && mmTargetSelect.value);
    moveState.targetNr = Number.isInteger(targetNr) ? targetNr : null;

    let rows = `<tr><td colspan="5">Bitte Ziel-Tisch wählen.</td></tr>`;
    if (Number.isInteger(moveState.targetNr)) {
        ensureBucket(moveState.targetNr);
        const list = reservationsByTable[moveState.targetNr];
        const mode = moveState.mode;

        rows = list.map(r => {
            const dis = (mode === "swap") ? "" : "disabled";
            return `
        <tr data-id="${r.id}">
          <td><input type="checkbox" class="mm-tgt-check" ${dis}></td>
          <td>${escapeHtml(r.name)}</td>
          <td>${r.cards}</td>
          <td>${noteToHtml(r.notes)}</td>
          <td><input type="number" class="mm-tgt-amt" min="1" max="${r.cards}" value="${r.cards}" ${dis}></td>
        </tr>
      `;
        }).join("");
        if (list.length === 0) {
            rows = `<tr><td colspan="5">Keine Reservierungen an Tisch ${moveState.targetNr}.</td></tr>`;
        }
    }

    mmTargetT.querySelector("tbody").innerHTML = rows;
    updateModalTotals();
    resetPreview();
    console.log("[MODAL] Ziel gerendert. targetNr:", moveState.targetNr);
}

// Totals berechnen
function updateModalTotals() {
    const { modalEl, mmSourceT, mmTargetT, mmTargetSelect, mmTotalLR, mmTotalRL, mmHint, btnCheck, btnApply } = getModalRefs();

    // Links → Rechts
    let lr = 0;
    if (mmSourceT) {
        mmSourceT.querySelectorAll("tbody tr").forEach(tr => {
            const check = tr.querySelector(".mm-src-check");
            const amt = tr.querySelector(".mm-src-amt");
            if (check && check.checked && amt) {
                const v = parseInt(amt.value);
                const mx = parseInt(amt.getAttribute("max"));
                if (Number.isInteger(v) && v >= 1 && v <= mx) lr += v;
            }
        });
    }
    if (mmTotalLR) mmTotalLR.textContent = lr;

    // Rechts → Links (nur Swap)
    let rl = 0;
    if (moveState.mode === "swap" && mmTargetT) {
        mmTargetT.querySelectorAll("tbody tr").forEach(tr => {
            const check = tr.querySelector(".mm-tgt-check");
            const amt = tr.querySelector(".mm-tgt-amt");
            if (check && check.checked && amt && !amt.disabled) {
                const v = parseInt(amt.value);
                const mx = parseInt(amt.getAttribute("max"));
                if (Number.isInteger(v) && v >= 1 && v <= mx) rl += v;
            }
        });
    }
    if (mmTotalRL) mmTotalRL.textContent = rl;

    // Modusklasse & Hinweis
    if (modalEl) modalEl.classList.toggle("modal--swap", moveState.mode === "swap");
    if (mmHint) {
        if (moveState.mode === "swap") {
            mmHint.textContent = "Modus „Tauschen“: Ziel-Tisch darf nach dem Tausch nicht überbucht sein.";
        } else {
            const targetNr = parseInt(mmTargetSelect && mmTargetSelect.value);
            const free = Number.isInteger(targetNr) ? (getSeatsByTableNumber(targetNr) || 0) : "—";
            mmHint.textContent = `Modus „Verschieben“: Ziel-Tisch braucht genügend freie Plätze (aktuell frei: ${free}).`;
        }
    }

    // -------- Fallback: Falls kein "Prüfen"-Button existiert, aktiviere "Ausführen" direkt wenn gültig --------
    if (!btnCheck && btnApply) {
        const targetNr = parseInt(mmTargetSelect && mmTargetSelect.value);
        const tgtFreeOld = Number.isInteger(targetNr) ? (getSeatsByTableNumber(targetNr) || 0) : null;
        const tgtFreeNew = (tgtFreeOld === null) ? null : (tgtFreeOld - lr + (moveState.mode === "swap" ? rl : 0));
        const targetOk = (tgtFreeNew !== null) && (tgtFreeNew >= 0);
        btnApply.disabled = !targetOk;
    }

    console.log("[MODAL] Totals aktualisiert:", { lr, rl, mode: moveState.mode });
    return { lr, rl };
}

// Vorschau berechnen & anzeigen
function runPreview() {
    const { mmPreview, prevOk, prevTgtErr, prevSrcWarn,
        prevSrcNr, prevSrcFreeOld, prevSrcFreeNew,
        prevTgtNr, prevTgtFreeOld, prevTgtFreeNew,
        btnApply } = getModalRefs();

    if (!Number.isInteger(moveState.targetNr)) {
        alert("Bitte Ziel-Tisch auswählen.");
        return;
    }
    const totals = updateModalTotals();
    const fromNr = moveState.sourceNr;
    const toNr   = moveState.targetNr;
    const lr = totals.lr;            // Karten von Quelle -> Ziel
    const rl = (moveState.mode === "swap") ? totals.rl : 0;  // Karten von Ziel -> Quelle

    const srcFreeOld = getSeatsByTableNumber(fromNr) || 0;
    const tgtFreeOld = getSeatsByTableNumber(toNr) || 0;

    const srcFreeNew = srcFreeOld + lr - rl;
    const tgtFreeNew = tgtFreeOld - lr + rl;

    // Vorschau-Felder
    prevSrcNr.textContent = fromNr;
    prevTgtNr.textContent = toNr;
    prevSrcFreeOld.textContent = srcFreeOld;
    prevTgtFreeOld.textContent = tgtFreeOld;
    prevSrcFreeNew.textContent = srcFreeNew;
    prevTgtFreeNew.textContent = tgtFreeNew;

    // States
    const targetOk = (tgtFreeNew >= 0);
    const sourceWarn = (srcFreeNew < 0); // nur Hinweis

    prevTgtErr.style.display = targetOk ? "none" : "inline-block";
    prevOk.style.display = targetOk ? "inline-block" : "none";
    prevSrcWarn.style.display = sourceWarn ? "inline-block" : "none";

    mmPreview.style.display = "grid";
    moveState.previewOk = targetOk;
    btnApply.disabled = !targetOk;

    console.log("[MODAL/PREVIEW]", { fromNr, toNr, lr, rl, srcFreeOld, srcFreeNew, tgtFreeOld, tgtFreeNew, targetOk, sourceWarn });
}

// Anwenden (nach erfolgreicher Prüfung)
function applyMoveOrSwap() {
    if (!moveState.previewOk) {
        alert("Bitte zuerst erfolgreich prüfen.");
        return;
    }
    const { mmSourceT, mmTargetT } = getModalRefs();
    const targetNr = moveState.targetNr;
    if (!Number.isInteger(targetNr)) { alert("Bitte Ziel-Tisch auswählen."); return; }

    // Einsammeln: Quelle
    const srcSelections = [];
    mmSourceT.querySelectorAll("tbody tr").forEach(tr => {
        const id = tr.getAttribute("data-id");
        const check = tr.querySelector(".mm-src-check");
        const amtEl = tr.querySelector(".mm-src-amt");
        if (check && check.checked) {
            const amt = parseInt(amtEl.value);
            const mx = parseInt(amtEl.getAttribute("max"));
            if (!Number.isInteger(amt) || amt < 1 || amt > mx) return;
            srcSelections.push({ id, amount: amt });
        }
    });
    if (srcSelections.length === 0) { alert("Bitte mindestens eine Reservierung links auswählen."); return; }

    // Einsammeln: Ziel (nur Swap)
    const tgtSelections = [];
    if (moveState.mode === "swap") {
        mmTargetT.querySelectorAll("tbody tr").forEach(tr => {
            const id = tr.getAttribute("data-id");
            const check = tr.querySelector(".mm-tgt-check");
            const amtEl = tr.querySelector(".mm-tgt-amt");
            if (check && check.checked && amtEl && !amtEl.disabled) {
                const amt = parseInt(amtEl.value);
                const mx = parseInt(amtEl.getAttribute("max"));
                if (!Number.isInteger(amt) || amt < 1 || amt > mx) return;
                tgtSelections.push({ id, amount: amt });
            }
        });
    }

    const sumLR = srcSelections.reduce((s, x) => s + x.amount, 0);
    const sumRL = tgtSelections.reduce((s, x) => s + x.amount, 0);

    console.log("[MODAL/APPLY] Auswahl:", { mode: moveState.mode, sourceNr: moveState.sourceNr, targetNr, srcSelections, tgtSelections, sumLR, sumRL });

    // ---- Daten anpassen ----
    const fromNr = moveState.sourceNr;
    ensureBucket(fromNr);
    ensureBucket(targetNr);
    const srcList = reservationsByTable[fromNr];
    const tgtList = reservationsByTable[targetNr];

    const srcById = Object.fromEntries(srcList.map(r => [r.id, r]));
    const tgtById = Object.fromEntries(tgtList.map(r => [r.id, r]));

    // 1) Quelle → Ziel
    srcSelections.forEach(sel => {
        const rec = srcById[sel.id];
        if (!rec) return;
        const moveAmt = Math.min(sel.amount, rec.cards);
        rec.cards -= moveAmt;
        if (moveAmt > 0) {
            let mergeIdx = tgtList.findIndex(r => r.bookingId === rec.bookingId && r.name === rec.name);
            if (mergeIdx >= 0) {
                tgtList[mergeIdx].cards += moveAmt;
                tgtList[mergeIdx].ts = new Date().toISOString();
            } else {
                tgtList.push({
                    id: uid(),
                    bookingId: rec.bookingId,
                    name: rec.name,
                    cards: moveAmt,
                    notes: rec.notes || "",
                    ts: new Date().toISOString()
                });
            }
        }
    });
    for (let i = srcList.length - 1; i >= 0; i--) if (srcList[i].cards <= 0) srcList.splice(i, 1);

    // 2) Ziel → Quelle (Swap)
    if (moveState.mode === "swap") {
        tgtSelections.forEach(sel => {
            const rec = tgtById[sel.id];
            if (!rec) return;
            const moveAmt = Math.min(sel.amount, rec.cards);
            rec.cards -= moveAmt;
            if (moveAmt > 0) {
                let mergeIdx = srcList.findIndex(r => r.bookingId === rec.bookingId && r.name === rec.name);
                if (mergeIdx >= 0) {
                    srcList[mergeIdx].cards += moveAmt;
                    srcList[mergeIdx].ts = new Date().toISOString();
                } else {
                    srcList.push({
                        id: uid(),
                        bookingId: rec.bookingId,
                        name: rec.name,
                        cards: moveAmt,
                        notes: rec.notes || "",
                        ts: new Date().toISOString()
                    });
                }
            }
        });
        for (let i = tgtList.length - 1; i >= 0; i--) if (tgtList[i].cards <= 0) tgtList.splice(i, 1);
    }

    // 3) Plätze verrechnen (nur Ziel darf nicht überbucht sein – bereits geprüft)
    const newFrom = (getSeatsByTableNumber(fromNr) || 0) + sumLR - sumRL;
    const newTo   = (getSeatsByTableNumber(targetNr) || 0) - sumLR + sumRL;
    setSeatsByTableNumber(fromNr, newFrom);
    setSeatsByTableNumber(targetNr, newTo);

    console.log("[MODAL/APPLY] Erfolgreich angewendet.", { fromNr, toNr: targetNr, newFrom, newTo });

    // UI aktualisieren
    printTischArray(tisch);
    setSelectedTableNr(targetNr);
    closeMoveModal();
}

// Modal-Events
function wireModalEvents() {
    const refs = getModalRefs();
    if (!refs.modalEl) return;

    // Close/Cancel/Apply/Check
    refs.btnClose  && refs.btnClose.addEventListener("click", closeMoveModal);
    refs.btnCancel && refs.btnCancel.addEventListener("click", closeMoveModal);
    refs.btnApply  && refs.btnApply.addEventListener("click", applyMoveOrSwap);
    refs.btnCheck  && refs.btnCheck.addEventListener("click", runPreview);

    // Radiobuttons Modus
    refs.modalEl.addEventListener("change", (e) => {
        const r = e.target.closest('input[name="moveMode"]');
        if (!r) return;
        moveState.mode = r.value; // "move" | "swap"
        const { modalEl } = getModalRefs();
        modalEl.classList.toggle("modal--swap", moveState.mode === "swap");
        renderModalTargetTable();  // Checkboxen rechts aktivieren/deaktivieren
        updateModalTotals();
        resetPreview();
        console.log("[MODAL] Modus gewechselt:", moveState.mode);
    });

    // Ziel-Select
    refs.mmTargetSelect && refs.mmTargetSelect.addEventListener("change", () => {
        console.log("[MODAL] Ziel-Tisch geändert:", refs.mmTargetSelect.value);
        renderModalTargetTable();
    });

    // Delegation: Quelle-Tabellen-Events
    refs.mmSourceT && refs.mmSourceT.addEventListener("change", (e) => {
        const tr = e.target.closest("tr[data-id]");
        if (!tr) return;
        const check = tr.querySelector(".mm-src-check");
        const amt   = tr.querySelector(".mm-src-amt");
        if (e.target.classList.contains("mm-src-check")) {
            amt.disabled = !check.checked;
        }
        updateModalTotals();
        resetPreview();
    });
    refs.mmSourceT && refs.mmSourceT.addEventListener("input", (e) => {
        if (e.target.classList.contains("mm-src-amt")) {
            updateModalTotals();
            resetPreview();
        }
    });

    // Delegation: Ziel-Tabellen-Events
    refs.mmTargetT && refs.mmTargetT.addEventListener("change", (e) => {
        const tr = e.target.closest("tr[data-id]");
        if (!tr) return;
        if (moveState.mode !== "swap") return;
        const check = tr.querySelector(".mm-tgt-check");
        const amt   = tr.querySelector(".mm-tgt-amt");
        if (e.target.classList.contains("mm-tgt-check")) {
            amt.disabled = !check.checked;
        }
        updateModalTotals();
        resetPreview();
    });
    refs.mmTargetT && refs.mmTargetT.addEventListener("input", (e) => {
        if (e.target.classList.contains("mm-tgt-amt")) {
            updateModalTotals();
            resetPreview();
        }
    });

    // Schließen bei Klick auf Backdrop
    refs.modalEl.addEventListener("click", (e) => {
        if (e.target === refs.modalEl || e.target.classList.contains("modal__backdrop")) {
            closeMoveModal();
        }
    });

    // Escape
    document.addEventListener("keydown", (e) => {
        if (!refs.modalEl.classList.contains("hidden") && e.key === "Escape") closeMoveModal();
    });
}

// ---------------------------------------------
// Aktionen in der Reservierungstabelle
// ---------------------------------------------

function onReservationTableClick(e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;

    var action = btn.getAttribute("data-action");
    var id = btn.getAttribute("data-id");
    var fromNr = getSelectedTableNr();

    console.log("[ROW ACTION]", { action, id, fromNr });

    if (!Number.isInteger(fromNr)) {
        console.warn("[ROW ACTION] Kein Tisch ausgewählt.");
        return;
    }

    ensureBucket(fromNr);
    var list = reservationsByTable[fromNr];
    var idx = list.findIndex(r => r.id === id);
    if (idx < 0) {
        console.warn("[ROW ACTION] Reservierung nicht gefunden:", id);
        return;
    }

    var rec = list[idx];

    if (action === "delete") {
        if (!confirm(`Reservierung von "${rec.name}" (${rec.cards} Karten) wirklich löschen?`)) return;
        var avail = getSeatsByTableNumber(fromNr) || 0;
        setSeatsByTableNumber(fromNr, avail + rec.cards);
        list.splice(idx, 1);
        printTischArray(tisch);
        renderReservationsForSelectedTable();
        console.log("[DELETE] Entfernt:", rec);
    }

    if (action === "note") {
        var current = normalizeWishNote(rec.notes || "");
        var txt = prompt(`Notiz für "${rec.name}" (Tisch ${fromNr}):`, current);
        if (txt !== null) {
            rec.notes = normalizeWishNote(txt);
            renderReservationsForSelectedTable();
            console.log("[NOTE] Aktualisiert:", rec);
        }
    }

    if (action === "edit") {
        var newCount = parseInt(prompt(`Kartenanzahl für "${rec.name}" an Tisch ${fromNr} ändern:`, rec.cards));
        if (!Number.isInteger(newCount) || newCount <= 0) { alert("Ungültige Anzahl."); return; }
        var delta = newCount - rec.cards;
        if (delta === 0) return;

        var avail = getSeatsByTableNumber(fromNr) || 0;
        if (delta > 0 && avail < delta) {
            alert(`Nicht genug freie Plätze an Tisch ${fromNr}. Verfügbar: ${avail}`);
            return;
        }

        setSeatsByTableNumber(fromNr, avail - delta);
        rec.cards = newCount;
        printTischArray(tisch);
        renderReservationsForSelectedTable();
        console.log("[EDIT] Neu:", rec.cards, "Delta:", delta);
    }

    if (action === "move") {
        openMoveModal(fromNr, rec.id);
    }
}

// ---------------------------------------------
// Events & Initialisierung
// ---------------------------------------------

// Select
var selectEl = document.getElementById("table-select");
if (selectEl) {
    selectEl.addEventListener("change", function () {
        updateFooter();
        renderReservationsForSelectedTable();
        console.log("[UI] Select geändert:", selectEl.value);
    });
} else {
    console.warn("[INIT] table-select nicht gefunden.");
}

// Hauptbuttons
var btnBook         = document.getElementById("btn-book");
var btnChangeSeats  = document.getElementById("btn-change-seats");
var btnExportSeats  = document.getElementById("btn-export-seats");
var btnImportSeats  = document.getElementById("btn-import-seats");
var btnExportRes    = document.getElementById("btn-export-res");
var btnImportRes    = document.getElementById("btn-import-res");

btnBook        && btnBook.addEventListener("click",  berechneReservierung);
btnChangeSeats && btnChangeSeats.addEventListener("click", changePlätze);
btnExportSeats && btnExportSeats.addEventListener("click", exportSeatsJSON);
btnImportSeats && btnImportSeats.addEventListener("click", importSeatsJSON);
btnExportRes   && btnExportRes.addEventListener("click", exportReservationsJSON);
btnImportRes   && btnImportRes.addEventListener("click", importReservationsJSON);

// Event Delegation für Aktionen in der Tabelle
var tbodyEl = getReservationTbody();
if (tbodyEl) {
    tbodyEl.addEventListener("click", onReservationTableClick);
    console.log("[INIT] Event-Delegation am Tabellen-Body aktiv.");
} else {
    console.warn("[INIT] Tabellen-Body (#reservationview table tbody) nicht gefunden.");
}

// Initial
printTischArray(tisch);
updateFooter();
renderReservationsForSelectedTable();
