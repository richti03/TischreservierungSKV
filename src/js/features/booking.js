// Reservierung berechnen + Verteilung

import {
    tisch, alleExportCodes, sortTischArrayPlace, ensureBucket, nextBookingId, uid,
    setSeatsByTableNumber, findIndexByTableNumber, reservationsByTable
} from "../core/state.js";
import { printTischArray, setSelectedTableNr, renderReservationsForSelectedTable } from "../ui/tableView.js";

export function berechneReservierung() {
    const name  = prompt("Bitte gib den Namen des Kunden ein:");
    const cards = parseInt(prompt("Bitte gib die Anzahl der reservierten Karten an:"));
    let preferredNr = parseInt(prompt("Tischwunsch (optional): Tischnummer eingeben oder leer lassen: (0 = Stehplatz)"));
    if (!Number.isInteger(preferredNr)) preferredNr = null;

    if (!name || !Number.isInteger(cards) || cards <= 0) {
        alert("Bitte gültige Angaben machen.");
        return;
    }

    sortTischArrayPlace(tisch);
    const usedTables = reservierteKarten(tisch, cards, name, preferredNr);

    printTischArray(tisch);
    const now = new Date().toLocaleString();
    window.alleExportCodes = (window.alleExportCodes || alleExportCodes) + now + "\n" + berechneExportohneAusgabe() + "\n\n";

    if (Array.isArray(usedTables) && usedTables.length > 0) setSelectedTableNr(usedTables[0]);
    else renderReservationsForSelectedTable();
}

export function berechneExportohneAusgabe() {
    return tisch.map(([nr, seats]) => `${nr}:${seats}`).join(",");
}

/** Verteilung (bevorzugt Tischwunsch; Notiz immer „Tischwunsch: Tisch X“) */
export function reservierteKarten(t, c, n, preferredNr) {
    let rest = c;
    const usedTables = [];

    const iso = new Date().toISOString();
    const bookingId = nextBookingId();

    let wishNoteText = () => {
        if (!Number.isInteger(preferredNr) && !(preferredNr === null)) {
            return preferredNr === 0 ? "Tischwunsch: Stehplatz" : `Tischwunsch: Tisch ${preferredNr}`;
        } else {
            return "";
        }
    };

    // Wunsch zuerst
    if (Number.isInteger(preferredNr)) {
        const wIdx = findIndexByTableNumber(preferredNr);
        if (wIdx >= 0) {
            const wAvail = t[wIdx][1];
            if (wAvail > 0 && rest > 0) {
                const take = Math.min(wAvail, rest);
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
        const exactIdx = t.findIndex(row => row[1] === rest);
        if (exactIdx !== -1) {
            const exactTable = t[exactIdx][0];
            t[exactIdx][1] = 0;
            ensureBucket(exactTable);
            reservationsByTable[exactTable].push({ id: uid(), bookingId, name: n, cards: rest, notes: wishNoteText(), ts: iso });
            usedTables.push(exactTable);
            rest = 0;
        } else {
            let counter = 0;
            while (rest > 0 && counter < t.length) {
                const [tableNr, avail] = t[counter];
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

    let msg = `${n}\n`;
    usedTables.forEach(tn => {
        const sum = (reservationsByTable[tn] || []).filter(r => r.bookingId === bookingId)
            .reduce((s, r) => s + (r.cards || 0), 0);
        msg += `Tisch ${tn}: ${sum} Karten\n`;
    });

    alert(msg.trim());
    console.log("[BOOKING] Reservierung erfasst:", { name:n, gesamt:c, usedTables, bookingId });
    window.alleAktionen = (window.alleAktionen || "") + msg + "\n";
    return usedTables;
}
