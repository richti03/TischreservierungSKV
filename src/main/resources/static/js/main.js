// Bootstrapping & Events

import { ensureEventStateLoaded } from "./core/state.js";
import { printTischArray, updateFooter, renderReservationsForSelectedTable } from "./ui/tableView.js";
import { berechneReservierung } from "./features/booking.js";
import { changePlätze, tischHinzufuegen, tischEntfernen } from "./features/tablesCrud.js";
import { exportSeatsJSON, importSeatsJSON, exportReservationsJSON, importReservationsJSON } from "./features/importExport.js";
import { onReservationTableClick } from "./events/actions.js";
import { openBookingSearchModal } from "./features/searchModal.js"; // optional
import { setupInternalPlanSync, openInternalPlanTab } from "./features/internalPlanSync.js";
import { setupExternalPlanSync, openExternalPlanTab } from "./features/externalPlanSync.js";
import { setupCustomerDisplaySync, openCustomerDisplayTab, signalNextCustomer } from "./features/customerDisplaySync.js";
import { downloadInvoicesZip } from "./features/invoices.js";

import { initializeTableSelect } from "./ui/tableSelect.js";
import { initializeSettingsPanel } from "./ui/settingsPanel.js";
import { initializeEventManagement } from "./ui/eventManagement.js";
import { initializeCartHeader } from "./ui/cartHeader.js";

async function bootstrap() {
    await ensureEventStateLoaded();

    const settingsPanelControls = initializeSettingsPanel();
    const { updateCardPriceDisplay = () => {} } = settingsPanelControls || {};

    const rerenderActiveEvent = () => {
        printTischArray();
        updateFooter();
        renderReservationsForSelectedTable();
        updateCardPriceDisplay();
    };

    initializeEventManagement({ rerenderActiveEvent });
    initializeTableSelect();
    initializeCartHeader();

    setupInternalPlanSync();
    setupExternalPlanSync();
    setupCustomerDisplaySync();

    function closeAllModals() {
        document.dispatchEvent(new CustomEvent("customerFlow:close-modals"));
        const modalNodes = document.querySelectorAll(".modal");
        modalNodes.forEach(modal => {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        });
        const paymentDialog = document.getElementById("paymentMethodDialog");
        if (paymentDialog) {
            paymentDialog.classList.add("hidden");
            paymentDialog.setAttribute("aria-hidden", "true");
        }
        const overlayIds = ["event-name-dialog", "event-start-overlay"];
        overlayIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (typeof el.hidden === "boolean") {
                el.hidden = true;
            } else {
                el.setAttribute("hidden", "");
            }
        });
    }

    const $ = id => document.getElementById(id);
    $("btn-book")?.addEventListener("click", berechneReservierung);
    $("btn-change-seats")?.addEventListener("click", changePlätze);
    $("btn-export-seats")?.addEventListener("click", exportSeatsJSON);
    $("btn-import-seats")?.addEventListener("click", importSeatsJSON);
    $("btn-export-res")?.addEventListener("click", exportReservationsJSON);
    $("btn-import-res")?.addEventListener("click", importReservationsJSON);
    $("btn-search-bookings")?.addEventListener("click", () => openBookingSearchModal());
    $("btn-open-internal-plan")?.addEventListener("click", openInternalPlanTab);
    $("btn-open-external-plan")?.addEventListener("click", openExternalPlanTab);
    $("btn-open-customer-display")?.addEventListener("click", openCustomerDisplayTab);
    $("btn-download-invoices")?.addEventListener("click", downloadInvoicesZip);

    const nextCustomerBtn = document.getElementById("btn-next-customer");
    nextCustomerBtn?.addEventListener("click", () => {
        closeAllModals();
        document.dispatchEvent(new CustomEvent("customerFlow:next-customer"));
        signalNextCustomer();
    });

    $("btn-add-table")?.addEventListener("click", tischHinzufuegen);
    $("btn-remove-table")?.addEventListener("click", tischEntfernen);

    const tbodyEl = document.querySelector("#reservationview table tbody");
    if (tbodyEl) {
        tbodyEl.addEventListener("click", onReservationTableClick);
        console.log("[INIT] Event-Delegation am Tabellen-Body aktiv.");
    } else {
        console.warn("[INIT] Tabellen-Body (#reservationview table tbody) nicht gefunden.");
    }

    window.berechneReservierung = window.berechneReservierung || berechneReservierung;
    window.changePlätze = window.changePlätze || changePlätze;
    window.exportSeatsJSON = window.exportSeatsJSON || exportSeatsJSON;
    window.importSeatsJSON = window.importSeatsJSON || importSeatsJSON;
    window.exportReservationsJSON = window.exportReservationsJSON || exportReservationsJSON;
    window.importReservationsJSON = window.importReservationsJSON || importReservationsJSON;
    window.tischHinzufuegen = window.tischHinzufuegen || tischHinzufuegen; // <— wichtig
    window.tischEntfernen = window.tischEntfernen || tischEntfernen;   // <— wichtig
    window.openBookingSearchModal = window.openBookingSearchModal || openBookingSearchModal;

    rerenderActiveEvent();
}

bootstrap().catch(err => {
    console.error("[BOOT] Fehler beim Initialisieren der Anwendung:", err);
});
