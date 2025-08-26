// Bootstrapping & Events

import { printTischArray, updateFooter, renderReservationsForSelectedTable } from "./ui/tableView.js";
import { berechneReservierung } from "./features/booking.js";
import { changePlätze } from "./features/tablesCrud.js";
import { exportSeatsJSON, importSeatsJSON, exportReservationsJSON, importReservationsJSON } from "./features/importExport.js";
import { onReservationTableClick } from "./events/actions.js";

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

// Hauptbuttons
const $ = id => document.getElementById(id);
$("btn-book")        ?.addEventListener("click", berechneReservierung);
$("btn-change-seats")?.addEventListener("click", changePlätze);
$("btn-export-seats")?.addEventListener("click", exportSeatsJSON);
$("btn-import-seats")?.addEventListener("click", importSeatsJSON);
$("btn-export-res")  ?.addEventListener("click", exportReservationsJSON);
$("btn-import-res")  ?.addEventListener("click", importReservationsJSON);

// Event Delegation für Tabellen-Aktionen
const tbodyEl = document.querySelector('#reservationview table tbody');
if (tbodyEl) {
    tbodyEl.addEventListener("click", onReservationTableClick);
    console.log("[INIT] Event-Delegation am Tabellen-Body aktiv.");
} else {
    console.warn("[INIT] Tabellen-Body (#reservationview table tbody) nicht gefunden.");
}

// Initiales Rendering
printTischArray();   // baut Select & Tischliste
updateFooter();
renderReservationsForSelectedTable();
