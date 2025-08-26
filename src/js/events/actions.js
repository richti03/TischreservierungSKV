// Zeilenaktionen in der Reservierungstabelle

import {
    reservationsByTable, getSeatsByTableNumber, setSeatsByTableNumber
} from "../core/state.js";
import { getSelectedTableNr, renderReservationsForSelectedTable } from "../ui/tableView.js";
import { openMoveModal } from "../features/modalMoveSwap.js";

export function onReservationTableClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    const fromNr = getSelectedTableNr();
    console.log("[ROW ACTION]", { action, id, fromNr });

    if (!Number.isInteger(fromNr)) return console.warn("[ROW ACTION] Kein Tisch ausgewählt.");

    const list = (reservationsByTable[fromNr] ||= []);
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return console.warn("[ROW ACTION] Reservierung nicht gefunden:", id);

    const rec = list[idx];

    if (action === "delete") {
        if (!confirm(`Reservierung von "${rec.name}" (${rec.cards} Karten) wirklich löschen?`)) return;
        const avail = getSeatsByTableNumber(fromNr) || 0;
        setSeatsByTableNumber(fromNr, avail + rec.cards);
        list.splice(idx, 1);
        renderReservationsForSelectedTable();
        console.log("[DELETE] Entfernt:", rec);
    }

    if (action === "note") {
        const txt = prompt(`Notiz für "${rec.name}" (Tisch ${fromNr}):`, rec.notes || "");
        if (txt !== null) { rec.notes = txt; renderReservationsForSelectedTable(); console.log("[NOTE] Aktualisiert:", rec); }
    }

    if (action === "edit") {
        const newCount = parseInt(prompt(`Kartenanzahl für "${rec.name}" an Tisch ${fromNr} ändern:`, rec.cards));
        if (!Number.isInteger(newCount) || newCount <= 0) return alert("Ungültige Anzahl.");
        const delta = newCount - rec.cards;
        if (delta === 0) return;
        const avail = getSeatsByTableNumber(fromNr) || 0;
        if (delta > 0 && avail < delta) return alert(`Nicht genug freie Plätze an Tisch ${fromNr}. Verfügbar: ${avail}`);
        setSeatsByTableNumber(fromNr, avail - delta);
        rec.cards = newCount;
        renderReservationsForSelectedTable();
        console.log("[EDIT] Neu:", rec.cards, "Delta:", delta);
    }

    if (action === "move") openMoveModal(fromNr, rec.id);
}
