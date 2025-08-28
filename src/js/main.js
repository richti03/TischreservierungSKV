// Bootstrapping & Events

import { printTischArray, updateFooter, renderReservationsForSelectedTable } from "./ui/tableView.js";
import { berechneReservierung } from "./features/booking.js";
import { changePlätze } from "./features/tablesCrud.js";
import { exportSeatsJSON, importSeatsJSON, exportReservationsJSON, importReservationsJSON } from "./features/importExport.js";
import { onReservationTableClick } from "./events/actions.js";
import { openBookingSearchModal } from "./features/searchModal.js"; // <— NEU

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
$("btn-book")        ?.addEventListener("click", berechneReservierung);
$("btn-change-seats")?.addEventListener("click", changePlätze);
$("btn-export-seats")?.addEventListener("click", exportSeatsJSON);
$("btn-import-seats")?.addEventListener("click", importSeatsJSON);
$("btn-export-res")  ?.addEventListener("click", exportReservationsJSON);
$("btn-import-res")  ?.addEventListener("click", importReservationsJSON);
$("btn-search-bookings")?.addEventListener("click", openBookingSearchModal); // <— NEU (optional)

// Event Delegation für Tabellen-Aktionen
const tbodyEl = document.querySelector('#reservationview table tbody');
if (tbodyEl) {
    tbodyEl.addEventListener("click", onReservationTableClick);
    console.log("[INIT] Event-Delegation am Tabellen-Body aktiv.");
} else {
    console.warn("[INIT] Tabellen-Body (#reservationview table tbody) nicht gefunden.");
}

// Legacy-Bridge: erlaubt weiterhin inline onclick="..." in der HTML
window.berechneReservierung   = window.berechneReservierung   || berechneReservierung;
window.changePlätze           = window.changePlätze           || changePlätze;
window.exportSeatsJSON        = window.exportSeatsJSON        || exportSeatsJSON;
window.importSeatsJSON        = window.importSeatsJSON        || importSeatsJSON;
window.exportReservationsJSON = window.exportReservationsJSON || exportReservationsJSON;
window.importReservationsJSON = window.importReservationsJSON || importReservationsJSON;
window.openBookingSearchModal = window.openBookingSearchModal || openBookingSearchModal; // <— NEU

// Initiales Rendering
printTischArray();
updateFooter();
renderReservationsForSelectedTable();
