import { updateFooter, renderReservationsForSelectedTable, setSelectedTableNr } from "./tableView.js";
import { openBookingSearchModal } from "../features/searchModal.js";

/**
 * Initialisiert die Auswahl der Tische im Hauptmenü und synchronisiert externe Ereignisse.
 * Stellt sicher, dass sowohl UI-Interaktionen als auch Integrationen (z. B. Saalplan) den gleichen
 * Rendering-Flow verwenden.
 */
export function initializeTableSelect({ logger = console } = {}) {
    const selectEl = document.getElementById("table-select");

    if (!selectEl) {
        logger.info("[TableSelect] Kein #table-select Element gefunden (optional).");
    } else {
        selectEl.addEventListener("change", () => {
            if (selectEl.dataset.silentTableUpdate === "1") {
                delete selectEl.dataset.silentTableUpdate;
                return;
            }

            updateFooter();
            renderReservationsForSelectedTable();
            logger.debug?.("[TableSelect] Ausgewählter Tisch", selectEl.value);
        });
    }

    window.addEventListener("internal-plan:select-table", event => {
        const tableNr = event?.detail?.tableNr;
        if (!Number.isInteger(tableNr)) {
            logger.warn?.("[TableSelect] Ungültige Tisch-Nummer in internal-plan:select-table", event?.detail);
            return;
        }
        setSelectedTableNr(tableNr);
    });

    window.addEventListener("internal-plan:search-booking", event => {
        const query = event?.detail?.query;
        if (typeof query !== "string") {
            logger.warn?.("[TableSelect] Ungültige Suchanfrage für internal-plan:search-booking", event?.detail);
            return;
        }
        openBookingSearchModal(query);
    });
}
