// Bootstrapping & Events

import { printTischArray, updateFooter, renderReservationsForSelectedTable } from "./ui/tableView.js";
import { berechneReservierung } from "./features/booking.js";
import { changePlätze, tischHinzufuegen, tischEntfernen } from "./features/tablesCrud.js";
import { exportSeatsJSON, importSeatsJSON, exportReservationsJSON, importReservationsJSON } from "./features/importExport.js";
import { onReservationTableClick } from "./events/actions.js";
import { openBookingSearchModal } from "./features/searchModal.js"; // optional

// Select-Change
const selectEl = document.getElementById("table-select");
if (selectEl) {
    selectEl.addEventListener("change", () => {
        updateFooter();
        renderReservationsForSelectedTable();
        console.log("[UI] Select geändert:", selectEl.value);
    });
} else {
    console.warn("[INIT] table-select nicht gefunden.");
}

// Hauptbuttons (IDs vorausgesetzt)
const $ = id => document.getElementById(id);
$("btn-book")           ?.addEventListener("click", berechneReservierung);
$("btn-change-seats")   ?.addEventListener("click", changePlätze);
$("btn-export-seats")   ?.addEventListener("click", exportSeatsJSON);
$("btn-import-seats")   ?.addEventListener("click", importSeatsJSON);
$("btn-export-res")     ?.addEventListener("click", exportReservationsJSON);
$("btn-import-res")     ?.addEventListener("click", importReservationsJSON);
$("btn-search-bookings")?.addEventListener("click", openBookingSearchModal);

// NEU: Tische automatisch hinzufügen/entfernen
$("btn-add-table")      ?.addEventListener("click", tischHinzufuegen);
$("btn-remove-table")   ?.addEventListener("click", tischEntfernen);

// Event Delegation für Tabellen-Aktionen
const tbodyEl = document.querySelector('#reservationview table tbody');
if (tbodyEl) {
    tbodyEl.addEventListener("click", onReservationTableClick);
    console.log("[INIT] Event-Delegation am Tabellen-Body aktiv.");
} else {
    console.warn("[INIT] Tabellen-Body (#reservationview table tbody) nicht gefunden.");
}

// Legacy-Bridge für inline onclick="..."
window.berechneReservierung   = window.berechneReservierung   || berechneReservierung;
window.changePlätze           = window.changePlätze           || changePlätze;
window.exportSeatsJSON        = window.exportSeatsJSON        || exportSeatsJSON;
window.importSeatsJSON        = window.importSeatsJSON        || importSeatsJSON;
window.exportReservationsJSON = window.exportReservationsJSON || exportReservationsJSON;
window.importReservationsJSON = window.importReservationsJSON || importReservationsJSON;
window.tischHinzufuegen       = window.tischHinzufuegen       || tischHinzufuegen; // <— wichtig
window.tischEntfernen         = window.tischEntfernen         || tischEntfernen;   // <— wichtig
window.openBookingSearchModal = window.openBookingSearchModal || openBookingSearchModal;

// Initiales Rendering
printTischArray();
updateFooter();
renderReservationsForSelectedTable();
