// Bootstrapping & Events

import { printTischArray, updateFooter, renderReservationsForSelectedTable, setSelectedTableNr } from "./ui/tableView.js";
import { berechneReservierung } from "./features/booking.js";
import { changePlätze, tischHinzufuegen, tischEntfernen } from "./features/tablesCrud.js";
import { exportSeatsJSON, importSeatsJSON, exportReservationsJSON, importReservationsJSON } from "./features/importExport.js";
import { onReservationTableClick } from "./events/actions.js";
import { openBookingSearchModal } from "./features/searchModal.js"; // optional
import { setupInternalPlanSync, openInternalPlanTab} from "./features/internalPlanSync.js";
import { setupExternalPlanSync, openExternalPlanTab } from "./features/externalPlanSync.js";
import { getCardPriceValue, onCardPriceChange, setCardPriceValue, pickJSONFile } from "./core/state.js";
import {
    createEvent,
    onEventsChange,
    setActiveEvent,
    renameEvent,
    EVENT_TYPES,
    DEFAULT_EVENT_TYPE,
    buildEventName,
    parseEventName,
    parseReservationsFilename
} from "./core/events.js";
import { onCartChange, getCartEntries } from "./features/cart.js";
import { openCartModal } from "./features/cartModal.js";

// Select-Change
const selectEl = document.getElementById("table-select");
if (selectEl) {
    selectEl.addEventListener("change", () => {
        if (selectEl.dataset.silentTableUpdate === "1") {
            delete selectEl.dataset.silentTableUpdate;
            return;
        }
        updateFooter();
        renderReservationsForSelectedTable();
        console.log("[UI] Select geändert:", selectEl.value);
    });
} else {
    console.log("[INIT] table-select nicht vorhanden (optional).");
}

window.addEventListener("internal-plan:select-table", event => {
    const tableNr = event?.detail?.tableNr;
    if (!Number.isInteger(tableNr)) {
        return;
    }
    setSelectedTableNr(tableNr);
});

window.addEventListener("internal-plan:search-booking", event => {
    const query = event?.detail?.query;
    if (typeof query !== "string") {
        return;
    }
    openBookingSearchModal(query);
});

// Einstellungen / Sidepanel
const settingsPanel = document.getElementById("settings-panel");
const settingsToggle = document.getElementById("settings-toggle");
const settingsClose = document.getElementById("settings-close");
const settingsBackdrop = document.getElementById("settings-backdrop");
const cardPriceDisplay = document.getElementById("card-price-value");
const cardPriceEdit = document.getElementById("card-price-edit");

const euroFormatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
});

const updateCardPriceDisplay = () => {
    if (!cardPriceDisplay) {
        return;
    }
    const value = getCardPriceValue();
    cardPriceDisplay.textContent = euroFormatter.format(value);
    cardPriceDisplay.dataset.price = value.toString();
};

onCardPriceChange(() => {
    updateCardPriceDisplay();
});

let initialPrice = parseFloat(cardPriceDisplay?.dataset?.price || "");
if (!Number.isFinite(initialPrice) || initialPrice < 0) {
    initialPrice = getCardPriceValue();
}
setCardPriceValue(initialPrice);

const eventTabsContainer = document.getElementById("event-tabs");
const eventAddButton = document.getElementById("event-tab-add");
const eventAddMenu = document.getElementById("event-add-menu");
const eventAddNewButton = document.getElementById("event-add-new");
const eventAddImportButton = document.getElementById("event-add-import");
const eventStartOverlay = document.getElementById("event-start-overlay");
const eventStartNewButton = document.getElementById("event-start-new");
const eventStartImportButton = document.getElementById("event-start-import");
const eventRenameButton = document.getElementById("event-rename-btn");
const eventNameDisplay = document.getElementById("event-name-display");
const eventNameDialog = document.getElementById("event-name-dialog");
const eventNameForm = document.getElementById("event-name-form");
const eventNameDateInput = document.getElementById("event-name-date");
const eventNameTypeSelect = document.getElementById("event-name-type");
const eventNameCancelButton = document.getElementById("event-name-cancel");
const eventNameSubmitButton = document.getElementById("event-name-submit");
const eventNameTitle = document.getElementById("event-name-title");
const eventNameDescription = document.getElementById("event-name-description");
const eventNamePreview = document.getElementById("event-name-preview");

let latestEventsSnapshot = { events: [], activeEventId: null };
let lastRenderedEventId = null;
let isEventNameDialogVisible = false;
let resolveEventNameDialog = null;

const rerenderActiveEvent = () => {
    printTischArray();
    updateFooter();
    renderReservationsForSelectedTable();
    updateCardPriceDisplay();
};

const updateEventNamePreview = () => {
    if (!eventNamePreview) {
        return;
    }
    const dateValue = eventNameDateInput?.value;
    const typeValue = eventNameTypeSelect?.value;
    if (dateValue && typeValue) {
        const name = buildEventName(dateValue, typeValue);
        eventNamePreview.textContent = name ? `${name}.json` : "—";
    } else {
        eventNamePreview.textContent = "—";
    }
};

const onEventNameDialogKeydown = event => {
    if (event.key === "Escape") {
        event.preventDefault();
        closeEventNameDialog(null);
    }
};

function closeEventNameDialog(result) {
    if (!isEventNameDialogVisible) {
        return;
    }
    isEventNameDialogVisible = false;
    eventNameDialog?.setAttribute("aria-hidden", "true");
    if (eventNameDialog) {
        eventNameDialog.hidden = true;
    }
    eventNameForm?.reset();
    updateEventNamePreview();
    document.body?.classList.remove("event-name-dialog-open");
    document.removeEventListener("keydown", onEventNameDialogKeydown);
    const resolver = resolveEventNameDialog;
    resolveEventNameDialog = null;
    resolver?.(result);
}

function openEventNameDialog({ mode = "create", initialName = "", initialDate, initialType } = {}) {
    if (!eventNameDialog || !eventNameForm || !eventNameDateInput || !eventNameTypeSelect) {
        const fallback = window.prompt("Name der Veranstaltung", initialName || "");
        const trimmed = fallback ? fallback.trim() : "";
        return Promise.resolve(trimmed ? { name: trimmed } : null);
    }
    if (isEventNameDialogVisible) {
        return Promise.resolve(null);
    }

    const parsed = parseEventName(initialName);
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const dateValue = initialDate || parsed?.date || isoToday;
    const normalizedInitialType = initialType && EVENT_TYPES.includes(initialType) ? initialType : null;
    const typeValue = normalizedInitialType || parsed?.type || DEFAULT_EVENT_TYPE;

    return new Promise(resolve => {
        isEventNameDialogVisible = true;
        resolveEventNameDialog = resolve;

        if (eventNameTitle) {
            eventNameTitle.textContent = mode === "rename"
                ? "Veranstaltungsnamen ändern"
                : "Veranstaltung benennen";
        }
        if (eventNameDescription) {
            eventNameDescription.textContent = mode === "rename"
                ? "Passen Sie Veranstaltungsdatum und Art nach Bedarf an."
                : "Bitte wählen Sie das Veranstaltungsdatum und die Art der Veranstaltung aus.";
        }
        if (eventNameSubmitButton) {
            eventNameSubmitButton.textContent = mode === "rename" ? "Speichern" : "Anlegen";
        }

        eventNameDialog.hidden = false;
        eventNameDialog.setAttribute("aria-hidden", "false");
        document.body?.classList.add("event-name-dialog-open");

        eventNameDateInput.value = dateValue;
        eventNameTypeSelect.value = EVENT_TYPES.includes(typeValue) ? typeValue : DEFAULT_EVENT_TYPE;
        updateEventNamePreview();

        requestAnimationFrame(() => {
            eventNameDateInput.focus({ preventScroll: true });
        });

        document.addEventListener("keydown", onEventNameDialogKeydown);
    });
}

eventNameDateInput?.addEventListener("input", updateEventNamePreview);
eventNameDateInput?.addEventListener("change", updateEventNamePreview);
eventNameTypeSelect?.addEventListener("input", updateEventNamePreview);
eventNameTypeSelect?.addEventListener("change", updateEventNamePreview);

eventNameForm?.addEventListener("submit", event => {
    event.preventDefault();
    if (!eventNameForm.reportValidity()) {
        return;
    }
    const dateValue = eventNameDateInput?.value;
    const typeValue = eventNameTypeSelect?.value;
    if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        eventNameDateInput?.focus({ preventScroll: true });
        return;
    }
    const finalType = EVENT_TYPES.includes(typeValue) ? typeValue : DEFAULT_EVENT_TYPE;
    const name = buildEventName(dateValue, finalType);
    if (!name) {
        eventNameDateInput?.focus({ preventScroll: true });
        return;
    }
    closeEventNameDialog({ name, date: dateValue, type: finalType });
});

eventNameCancelButton?.addEventListener("click", () => {
    closeEventNameDialog(null);
});

eventNameDialog?.addEventListener("click", event => {
    if (event.target === eventNameDialog) {
        closeEventNameDialog(null);
    }
});

const isEventMenuOpen = () => !!(eventAddMenu && !eventAddMenu.hidden);

const closeEventMenu = () => {
    if (!eventAddMenu || eventAddMenu.hidden) {
        return;
    }
    eventAddMenu.hidden = true;
    eventAddButton?.setAttribute("aria-expanded", "false");
};

const openEventMenu = () => {
    if (!eventAddMenu) {
        return;
    }
    eventAddMenu.hidden = false;
    eventAddButton?.setAttribute("aria-expanded", "true");
};

const updateEventStartOverlay = snapshot => {
    if (!eventStartOverlay) {
        return;
    }
    const hasEvents = Array.isArray(snapshot?.events) && snapshot.events.length > 0;
    eventStartOverlay.hidden = hasEvents;
    if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("event-start-visible", !hasEvents);
    }
    if (!hasEvents) {
        closeEventMenu();
    }
};

const renderEventTabs = snapshot => {
    if (!eventTabsContainer) {
        return;
    }
    eventTabsContainer.innerHTML = "";
    const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
    const activeId = snapshot?.activeEventId ?? null;

    for (const entry of events) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `event-tab${entry.id === activeId ? " is-active" : ""}`;
        button.dataset.eventId = entry.id;
        button.textContent = entry.name;
        button.title = `${entry.name}\n(Doppelklick zum Umbenennen)`;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", entry.id === activeId ? "true" : "false");
        eventTabsContainer.appendChild(button);
    }
};

async function startEventCreation({ importAfterCreate = false } = {}) {
    closeEventMenu();
    if (importAfterCreate) {
        pickJSONFile((obj, filename) => {
            const meta = parseReservationsFilename(filename || "");
            if (!meta) {
                alert("ungültige Datei");
                return;
            }
            const created = createEvent({ name: meta.eventName });
            if (!created) {
                return;
            }
            importReservationsJSON({ presetData: obj, presetFilename: meta.filename });
        });
        return;
    }
    const result = await openEventNameDialog({ mode: "create" });
    if (!result || !result.name) {
        return;
    }
    createEvent({ name: result.name });
}

eventAddButton?.addEventListener("click", event => {
    event.stopPropagation();
    if (isEventMenuOpen()) {
        closeEventMenu();
    } else {
        openEventMenu();
    }
});

eventAddMenu?.addEventListener("click", event => {
    event.stopPropagation();
});

document.addEventListener("click", event => {
    if (!isEventMenuOpen()) {
        return;
    }
    const target = event.target;
    if (target instanceof Element) {
        if (eventAddMenu?.contains(target) || eventAddButton?.contains(target)) {
            return;
        }
    }
    closeEventMenu();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && isEventMenuOpen() && !isEventNameDialogVisible) {
        closeEventMenu();
        eventAddButton?.focus();
    }
});

eventAddNewButton?.addEventListener("click", () => {
    startEventCreation();
});

eventAddImportButton?.addEventListener("click", () => {
    startEventCreation({ importAfterCreate: true });
});

eventStartNewButton?.addEventListener("click", () => {
    startEventCreation();
});

eventStartImportButton?.addEventListener("click", () => {
    startEventCreation({ importAfterCreate: true });
});

eventTabsContainer?.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest(".event-tab") : null;
    if (!target) {
        return;
    }
    const id = target.dataset.eventId;
    if (!id) {
        return;
    }
    setActiveEvent(id);
    closeEventMenu();
});

eventTabsContainer?.addEventListener("dblclick", async event => {
    const target = event.target instanceof Element ? event.target.closest(".event-tab") : null;
    if (!target) {
        return;
    }
    const id = target.dataset.eventId;
    if (!id) {
        return;
    }
    const current = latestEventsSnapshot.events.find(entry => entry.id === id);
    const currentName = current?.name ?? "";
    const dialogResult = await openEventNameDialog({ mode: "rename", initialName: currentName });
    const trimmed = dialogResult?.name?.trim?.() ?? "";
    if (!trimmed || trimmed === currentName) {
        return;
    }
    renameEvent(id, trimmed);
});

eventRenameButton?.addEventListener("click", async () => {
    const activeId = latestEventsSnapshot?.activeEventId;
    if (!activeId) {
        return;
    }
    const current = latestEventsSnapshot.events.find(entry => entry.id === activeId);
    const currentName = current?.name ?? "";
    const dialogResult = await openEventNameDialog({ mode: "rename", initialName: currentName });
    const trimmed = dialogResult?.name?.trim?.() ?? "";
    if (!trimmed || trimmed === currentName) {
        return;
    }
    renameEvent(activeId, trimmed);
});

onEventsChange(snapshot => {
    latestEventsSnapshot = snapshot;
    renderEventTabs(snapshot);
    updateEventStartOverlay(snapshot);

    const activeId = snapshot?.activeEventId ?? null;
    const activeEvent = snapshot?.events?.find?.(entry => entry.id === activeId) || null;
    if (eventNameDisplay) {
        eventNameDisplay.textContent = activeEvent?.name || "—";
    }
    if (eventRenameButton) {
        eventRenameButton.disabled = !activeEvent;
    }
    if (!activeId) {
        lastRenderedEventId = null;
        return;
    }
    if (activeId !== lastRenderedEventId) {
        lastRenderedEventId = activeId;
        setSelectedTableNr(NaN);
    }
    rerenderActiveEvent();
});

const closeSettingsPanel = () => {
    if (!settingsPanel) {
        return;
    }
    settingsPanel.classList.remove("is-open");
    settingsPanel.setAttribute("aria-hidden", "true");
    if (settingsBackdrop) {
        settingsBackdrop.classList.remove("is-visible");
        settingsBackdrop.hidden = true;
    }
    document.removeEventListener("keydown", onSettingsKeydown);
};

const openSettingsPanel = () => {
    if (!settingsPanel) {
        return;
    }
    settingsPanel.classList.add("is-open");
    settingsPanel.setAttribute("aria-hidden", "false");
    if (settingsBackdrop) {
        settingsBackdrop.hidden = false;
        requestAnimationFrame(() => settingsBackdrop.classList.add("is-visible"));
    }
    settingsPanel.focus({ preventScroll: true });
    document.addEventListener("keydown", onSettingsKeydown);
};

const onSettingsKeydown = event => {
    if (event.key === "Escape") {
        closeSettingsPanel();
        settingsToggle?.focus();
    }
};

settingsToggle?.addEventListener("click", () => {
    if (settingsPanel?.classList.contains("is-open")) {
        closeSettingsPanel();
    } else {
        openSettingsPanel();
    }
});

settingsClose?.addEventListener("click", () => {
    closeSettingsPanel();
    settingsToggle?.focus();
});

settingsBackdrop?.addEventListener("click", () => {
    closeSettingsPanel();
});

cardPriceEdit?.addEventListener("click", () => {
    const current = getCardPriceValue();
    const input = window.prompt("Neuer Kartenpreis in Euro", euroFormatter
        .format(current)
        .replace(/\s/g, ""));
    if (input == null) {
        return;
    }
    const normalized = input
        .replace(/€/g, "")
        .replace(/\s/g, "")
        .replace(/,/g, ".");
    const value = Number.parseFloat(normalized);
    if (!Number.isFinite(value) || value < 0) {
        window.alert("Bitte geben Sie einen gültigen Preis ein.");
        return;
    }
    setCardPriceValue(value);
});

updateCardPriceDisplay();

// Warenkorb-Button im Header
const cartToggle = document.getElementById("cart-toggle");
const cartBadge = document.getElementById("cart-badge");

const updateCartBadge = entries => {
    if (!cartBadge || !cartToggle) return;
    const list = Array.isArray(entries) ? entries : getCartEntries();
    const count = list.length;
    cartBadge.textContent = String(count);
    cartBadge.hidden = count === 0;
    cartToggle.classList.toggle("has-items", count > 0);
    const label = count === 0
        ? "Warenkorb öffnen"
        : `Warenkorb öffnen (${count} ${count === 1 ? "Reservierung" : "Reservierungen"})`;
    cartToggle.setAttribute("aria-label", label);
};

cartToggle?.addEventListener("click", () => {
    openCartModal();
});

onCartChange(updateCartBadge);
updateCartBadge();

// Hauptbuttons (IDs vorausgesetzt)
const $ = id => document.getElementById(id);
$("btn-book")              ?.addEventListener("click", berechneReservierung);
$("btn-change-seats")      ?.addEventListener("click", changePlätze);
$("btn-export-seats")      ?.addEventListener("click", exportSeatsJSON);
$("btn-import-seats")      ?.addEventListener("click", importSeatsJSON);
$("btn-export-res")        ?.addEventListener("click", exportReservationsJSON);
$("btn-import-res")        ?.addEventListener("click", importReservationsJSON);
$("btn-search-bookings")   ?.addEventListener("click", () => openBookingSearchModal());
$("btn-open-internal-plan")?.addEventListener("click", openInternalPlanTab);
$("btn-open-external-plan")?.addEventListener("click", openExternalPlanTab);

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
setupInternalPlanSync();
setupExternalPlanSync();
rerenderActiveEvent();
