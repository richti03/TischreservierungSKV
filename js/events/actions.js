// Zeilenaktionen in der Reservierungstabelle

import {
    reservationsByTable, getSeatsByTableNumber, setSeatsByTableNumber, markEventStateDirty
} from "../core/state.js";
import {getSelectedTableNr, printTischArray, renderReservationsForSelectedTable} from "../ui/tableView.js";
import { addToCart, removeFromCart, markCartDirty } from "../features/cart.js";
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
        markCartDirty();
        printTischArray();
        renderReservationsForSelectedTable();
        console.log("[DELETE] Entfernt:", rec);
        markEventStateDirty("reservation-delete");
        return;
    }

    if (action === "note") {
        if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht bearbeitet werden.");
        const txt = prompt(`Notiz für "${rec.name}" (Tisch ${fromNr}):`, rec.notes || "");
        if (txt !== null) { rec.notes = txt; renderReservationsForSelectedTable(); markEventStateDirty("reservation-note"); console.log("[NOTE] Aktualisiert:", rec); }
        return;
    }

    if (action === "edit") {
        if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht bearbeitet werden.");
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
        markEventStateDirty("reservation-edit");
        return;
    }

    if (action === "move") {
        if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht verschoben werden.");
        openMoveModal(fromNr, rec.id);
        return;
    }

    if (action === "cart") {
        if (rec.sold) {
            alert("Als verkauft markierte Reservierungen können nicht in den Warenkorb gelegt werden.");
            return;
        }
        addToCart(fromNr, rec.id);
        renderReservationsForSelectedTable();
        return;
    }

    if (action === "cart-remove") {
        removeFromCart(fromNr, rec.id);
        renderReservationsForSelectedTable();
        return;
    }

    if (action === "sold") {
        rec.sold = true;
        rec.inCart = false;
        markCartDirty();
        renderReservationsForSelectedTable();
        console.log("[SOLD] Markiert als verkauft:", rec);
        markEventStateDirty("reservation-sold");
        return;
    }

    if (action === "unsold") {
        rec.sold = false;
        markCartDirty();
        renderReservationsForSelectedTable();
        console.log("[SOLD] Verkauf rückgängig:", rec);
        markEventStateDirty("reservation-unsold");
        return;
    }
}
