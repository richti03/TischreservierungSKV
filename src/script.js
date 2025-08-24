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

// ---------------------------------------------
// Hilfsfunktionen (Sortierung, Suche, Utils)
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
}

function getReservationTbody() { return document.querySelector('#reservationview table tbody'); }

function escapeHtml(str) {
    if (typeof str !== "string") return str;
    return str.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
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
            cb(obj);
        } catch (e) {
            console.error(e);
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
// Split-Info: andere Tische derselben Buchung
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
        var baseNotes = r.notes ? escapeHtml(r.notes) : "";
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
          <button class="btn" data-action="move"      data-id="${r.id}" title="Buchung zu anderem Tisch verschieben" aria-label="Verschieben">Verschieben</button>
          <button class="btn btn--ghost" data-action="delete"    data-id="${r.id}" title="Buchung löschen" aria-label="Löschen">Löschen</button>
        </td>
      </tr>
    `;
    }).join("");

    tbody.innerHTML = rows;
}

// ---------------------------------------------
// CRUD: Tische hinzufügen / entfernen / ändern
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
// Reservierungslogik (mit Tischwunsch)
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
 * Verteilt c Karten auf Tische (evtl. zuerst Wunsch-Tisch), reduziert die freien Plätze in t
 * und legt pro Tisch Reservierungs-Records an (mit gemeinsamer bookingId).
 * Gibt ein Array der verwendeten Tischnummern in Vergabe-Reihenfolge zurück.
 */
function reservierteKarten(t, c, n, preferredNr) {
    var rest = c;
    var usedTables = [];

    var now = new Date();
    var dateAndTime = now.toLocaleString();
    var iso = now.toISOString();
    var bookingId = genBookingId();

    function wishNote(used) {
        if (!Number.isInteger(preferredNr)) return "";
        return used
            ? `Tischwunsch: Tisch ${preferredNr}`
            : `Tischwunsch: Tisch ${preferredNr}`;
    }

    // Wunsch-Tisch zuerst
    var wishUsed = false;
    if (Number.isInteger(preferredNr)) {
        var wIdx = findIndexByTableNumber(preferredNr);
        if (wIdx >= 0) {
            var wAvail = t[wIdx][1];
            if (wAvail > 0 && rest > 0) {
                var take = Math.min(wAvail, rest);
                t[wIdx][1] -= take;
                ensureBucket(preferredNr);
                reservationsByTable[preferredNr].push({
                    id: uid(), bookingId, name: n, cards: take, notes: wishNote(true), ts: iso
                });
                usedTables.push(preferredNr);
                rest -= take;
                wishUsed = true;
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
            reservationsByTable[exactTable].push({
                id: uid(), bookingId, name: n, cards: rest, notes: wishNote(wishUsed), ts: iso
            });
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
                    reservationsByTable[tableNr].push({
                        id: uid(), bookingId, name: n, cards: avail, notes: wishNote(wishUsed), ts: iso
                    });
                    usedTables.push(tableNr);
                    rest -= avail;
                } else {
                    t[counter][1] = avail - rest;
                    ensureBucket(tableNr);
                    reservationsByTable[tableNr].push({
                        id: uid(), bookingId, name: n, cards: rest, notes: wishNote(wishUsed), ts: iso
                    });
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
    if (Number.isInteger(preferredNr)) {
        alertMessage += "(Tischwunsch: Tisch " + preferredNr + ")\n";
    }

    alert(alertMessage.trim());
    console.log(alertMessage.trim());
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
                notes: typeof r.notes === "string" ? r.notes : "",
                ts: r.ts || new Date().toISOString()
            })).filter(r => r.name && r.cards > 0);
        }
        reservationsByTable = next;
        renderReservationsForSelectedTable();
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
    if (!Number.isInteger(fromNr)) return;

    ensureBucket(fromNr);
    var list = reservationsByTable[fromNr];
    var idx = list.findIndex(r => r.id === id);
    if (idx < 0) return;

    var rec = list[idx];

    if (action === "delete") {
        if (!confirm(`Reservierung von "${rec.name}" (${rec.cards} Karten) wirklich löschen?`)) return;
        var avail = getSeatsByTableNumber(fromNr) || 0;
        setSeatsByTableNumber(fromNr, avail + rec.cards);
        list.splice(idx, 1);
        printTischArray(tisch);
        renderReservationsForSelectedTable();
    }

    if (action === "note") {
        var current = rec.notes || "";
        var txt = prompt(`Notiz für "${rec.name}" (Tisch ${fromNr}):`, current);
        if (txt !== null) {
            rec.notes = txt;
            renderReservationsForSelectedTable();
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
    }

    if (action === "move") {
        // Ziel-Tisch & Anzahl abfragen
        var toInput = prompt(`Zu welchem Tisch soll "${rec.name}" verschoben werden? (Ziel-Tischnummer)`);
        var toNr = parseInt(toInput);
        if (!Number.isInteger(toNr)) { alert("Ungültige Ziel-Tischnummer."); return; }
        if (toNr === fromNr) { alert("Ziel-Tisch ist derselbe wie der aktuelle Tisch."); return; }

        var toIdx = findIndexByTableNumber(toNr);
        if (toIdx < 0) { alert(`Tisch ${toNr} existiert nicht.`); return; }

        var maxMove = rec.cards;
        var moveInput = prompt(`Wie viele Karten verschieben? (1–${maxMove})`, String(maxMove));
        var moveCount = parseInt(moveInput);
        if (!Number.isInteger(moveCount) || moveCount <= 0 || moveCount > maxMove) {
            alert("Ungültige Anzahl zum Verschieben.");
            return;
        }

        var toAvail = getSeatsByTableNumber(toNr) || 0;
        if (toAvail < moveCount) {
            alert(`Nicht genug freie Plätze an Tisch ${toNr}. Verfügbar: ${toAvail}`);
            return;
        }

        // Plätze verrechnen
        setSeatsByTableNumber(fromNr, (getSeatsByTableNumber(fromNr) || 0) + moveCount);
        setSeatsByTableNumber(toNr, toAvail - moveCount);

        // Datensatz(e) anpassen
        rec.cards -= moveCount;
        if (rec.cards === 0) {
            // gesamten Eintrag aus Quell-Tisch entfernen
            list.splice(idx, 1);
        }

        // Ziel-Tisch: ggf. in bestehenden Datensatz (gleiche Buchung) mergen
        ensureBucket(toNr);
        var toList = reservationsByTable[toNr];
        var mergeIdx = toList.findIndex(r =>
            r.bookingId === rec.bookingId && r.name === rec.name
        );
        if (mergeIdx >= 0) {
            toList[mergeIdx].cards += moveCount;
            // Zeitstempel aktualisieren
            toList[mergeIdx].ts = new Date().toISOString();
        } else {
            toList.push({
                id: uid(),
                bookingId: rec.bookingId,
                name: rec.name,
                cards: moveCount,
                notes: rec.notes || "",
                ts: new Date().toISOString()
            });
        }

        printTischArray(tisch);
        setSelectedTableNr(toNr); // auf Ziel-Tisch springen
    }
}

// ---------------------------------------------
// Events & Initialisierung
// ---------------------------------------------

// Select
var selectEl = document.getElementById("table-select");
if (selectEl) selectEl.addEventListener("change", function () {
    updateFooter();
    renderReservationsForSelectedTable();
});

// Buttons (aus vorheriger Version – IDs in index.html vorhanden)
var btnBook         = document.getElementById("btn-book");
var btnChangeSeats  = document.getElementById("btn-change-seats");
var btnExportSeats  = document.getElementById("btn-export-seats");
var btnImportSeats  = document.getElementById("btn-import-seats");
var btnExportRes    = document.getElementById("btn-export-res");
var btnImportRes    = document.getElementById("btn-import-res");

if (btnBook)        btnBook.addEventListener("click",  berechneReservierung);
if (btnChangeSeats) btnChangeSeats.addEventListener("click", changePlätze);
if (btnExportSeats) btnExportSeats.addEventListener("click", exportSeatsJSON);
if (btnImportSeats) btnImportSeats.addEventListener("click", importSeatsJSON);
if (btnExportRes)   btnExportRes.addEventListener("click", exportReservationsJSON);
if (btnImportRes)   btnImportRes.addEventListener("click", importReservationsJSON);

// Event Delegation für Aktionen in der Tabelle
var tbodyEl = getReservationTbody();
if (tbodyEl) tbodyEl.addEventListener("click", onReservationTableClick);

// Initial
printTischArray(tisch);
updateFooter();
renderReservationsForSelectedTable();
