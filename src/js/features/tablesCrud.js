import {
    tisch, findIndexByTableNumber, reservationsByTable, sortTischArrayNr
} from "../core/state.js";
import { printTischArray, setSelectedTableNr, renderReservationsForSelectedTable } from "../ui/tableView.js";

/** kleinste freie positive Tischnummer (1,2,3, … Lücken werden gefüllt) */
function findNextAvailableTableNumber() {
    const used = new Set(tisch.map(([n]) => n));
    let n = 1;
    while (used.has(n)) n++;
    return n;
}

/** häufigster Sitzplatzwert als Standard (Fallback: 18) */
function getMostCommonSeats() {
    if (!tisch.length) return 18;
    const counts = new Map();
    for (const [, seats] of tisch) counts.set(seats, (counts.get(seats) || 0) + 1);
    let bestSeats = 18, bestCount = -1;
    for (const [seats, cnt] of counts.entries()) {
        if (cnt > bestCount) { bestCount = cnt; bestSeats = seats; }
    }
    return Number.isInteger(bestSeats) ? bestSeats : 18;
}

/** Nächstmöglichen Tisch automatisch hinzufügen (ohne Prompt) */
export function tischHinzufuegen() {
    const nr = findNextAvailableTableNumber();
    const seats = getMostCommonSeats();

    tisch.push([nr, seats]);
    sortTischArrayNr(tisch);
    if (!reservationsByTable[nr]) reservationsByTable[nr] = [];

    printTischArray(tisch);
    setSelectedTableNr(nr);

    console.log("[TABLES] Tisch hinzugefügt:", { nr, seats });
}

/** Letzten (höchsten) Tisch entfernen. Falls Reservierungen vorhanden: Sicherheitsabfrage. */
export function tischEntfernen() {
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

/** Plätze ändern (bestehend – bleibt erhalten) */
export function changePlätze() {
    const tnr = parseInt(prompt("Bitte Tischnummer eingeben:"));
    const plaetze = parseInt(prompt("Bitte neue Sitzplatzanzahl eingeben:"));
    if (!Number.isInteger(tnr) || !Number.isInteger(plaetze)) return alert("Bitte gültige Zahlen eingeben.");

    const idx = findIndexByTableNumber(tnr);
    if (idx >= 0) tisch[idx][1] = plaetze; else return alert("Tisch nicht gefunden!");
    printTischArray(tisch);
    setSelectedTableNr(tnr);
}
