import {
    pickJSONFile,
    getExternalEventName,
    onExternalEventNameChange,
} from "../core/state.js";
import {
    createEvent,
    onEventsChange,
    setActiveEvent,
    renameEvent,
    setEventDisplayName,
    removeEvent,
    EVENT_TYPES,
    DEFAULT_EVENT_TYPE,
    buildEventName,
    parseEventName,
    parseReservationsFilename,
} from "../core/events.js";
import { importReservationsJSON } from "../features/importExport.js";
import {
    setupEventCacheAutoSave,
    promptLoadFromCache,
    onCacheEntriesChange,
    promptRemoveCacheEntry,
} from "../features/cacheStorage.js";
import { setSelectedTableNr } from "./tableView.js";

/**
 * Bündelt sämtliche Logik rund um Veranstaltungen: Tabs, Start-Overlay,
 * Cache-Integration und das Benennen/Umbennen.
 */
export function initializeEventManagement({ rerenderActiveEvent, logger = console } = {}) {
    if (typeof rerenderActiveEvent !== "function") {
        throw new Error("rerenderActiveEvent muss eine Funktion sein");
    }

    const eventTabsContainer = document.getElementById("event-tabs");
    const headerEventTabsContainer = document.getElementById("header-event-tabs");
    const eventAddButton = document.getElementById("event-tab-add");
    const eventAddMenu = document.getElementById("event-add-menu");
    const eventAddNewButton = document.getElementById("event-add-new");
    const eventAddImportButton = document.getElementById("event-add-import");
    const eventAddCacheButton = document.getElementById("event-add-cache");
    const eventStartOverlay = document.getElementById("event-start-overlay");
    const eventStartNewButton = document.getElementById("event-start-new");
    const eventStartImportButton = document.getElementById("event-start-import");
    const eventStartCacheButton = document.getElementById("event-start-cache");
    const eventStartCacheDeleteButton = document.getElementById("event-start-cache-delete");
    const cacheRemoveActionButton = document.getElementById("btn-cache-remove");
    const eventRenameButton = document.getElementById("event-rename-btn");
    const eventNameDisplay = document.getElementById("event-name-display");
    const eventDisplayNameDisplay = document.getElementById("event-display-name");
    const eventDisplayNameButton = document.getElementById("event-display-name-btn");
    const eventRemoveButton = document.getElementById("event-remove-btn");
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

    setupEventCacheAutoSave();

    const updateEventDisplayNameValue = value => {
        if (!eventDisplayNameDisplay) {
            return;
        }
        const resolved = typeof value === "string" && value.trim()
            ? value.trim()
            : getExternalEventName();
        eventDisplayNameDisplay.textContent = resolved || "—";
    };

    onExternalEventNameChange(name => {
        updateEventDisplayNameValue(name);
    });
    updateEventDisplayNameValue(getExternalEventName());

    const eventTabContainers = [eventTabsContainer, headerEventTabsContainer].filter(Boolean);

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

    const createEventTabButton = (entry, activeId) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `event-tab${entry.id === activeId ? " is-active" : ""}`;
        button.dataset.eventId = entry.id;
        button.textContent = entry.name;
        button.title = `${entry.name}\n(Doppelklick zum Umbenennen)`;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", entry.id === activeId ? "true" : "false");
        return button;
    };

    const renderEventTabs = snapshot => {
        const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
        const activeId = snapshot?.activeEventId ?? null;

        for (const container of eventTabContainers) {
            container.innerHTML = "";
        }

        for (const entry of events) {
            for (const container of eventTabContainers) {
                const button = createEventTabButton(entry, activeId);
                container.appendChild(button);
            }
        }
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

    function createEventFromCacheEntry(entry) {
        if (!entry) {
            return false;
        }
        const created = createEvent({ name: entry.name, state: entry.state });
        if (!created) {
            return false;
        }
        if (entry.displayName && entry.displayName !== entry.name) {
            setEventDisplayName(created.id, entry.displayName);
        }
        return true;
    }

    function startEventLoadFromCache({ closeMenu = false } = {}) {
        const entry = promptLoadFromCache();
        if (!entry) {
            return;
        }
        const loaded = createEventFromCacheEntry(entry);
        if (!loaded) {
            window.alert("Die Veranstaltung konnte nicht aus dem Cache geladen werden.");
            return;
        }
        if (closeMenu) {
            closeEventMenu();
        }
    }

    function startCacheRemoval({ closeMenu = false } = {}) {
        const removed = promptRemoveCacheEntry();
        if (!removed) {
            return;
        }
        if (closeMenu) {
            closeEventMenu();
        }
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

    eventAddCacheButton?.addEventListener("click", () => {
        startEventLoadFromCache({ closeMenu: true });
    });

    eventStartNewButton?.addEventListener("click", () => {
        startEventCreation();
    });

    eventStartImportButton?.addEventListener("click", () => {
        startEventCreation({ importAfterCreate: true });
    });

    eventStartCacheButton?.addEventListener("click", () => {
        startEventLoadFromCache();
    });

    eventStartCacheDeleteButton?.addEventListener("click", () => {
        startCacheRemoval();
    });

    cacheRemoveActionButton?.addEventListener("click", () => {
        startCacheRemoval();
    });

    eventRemoveButton?.addEventListener("click", () => {
        const activeId = latestEventsSnapshot?.activeEventId;
        if (!activeId) {
            return;
        }
        const activeEvent = latestEventsSnapshot?.events?.find?.(entry => entry.id === activeId) || null;
        const label = activeEvent?.displayName || activeEvent?.name || "diese Veranstaltung";
        const confirmed = window.confirm(`Veranstaltung "${label}" wirklich entfernen? Alle Tische, Reservierungen und Einstellungen werden gelöscht.`);
        if (!confirmed) {
            return;
        }
        removeEvent(activeId);
        logger.info?.("[EventManagement] Veranstaltung entfernt", { id: activeId });
    });

    const onEventTabClick = event => {
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
    };

    const onEventTabDblClick = async event => {
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
    };

    for (const container of eventTabContainers) {
        container.addEventListener("click", onEventTabClick);
        container.addEventListener("dblclick", onEventTabDblClick);
    }

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

    eventDisplayNameButton?.addEventListener("click", () => {
        const activeId = latestEventsSnapshot?.activeEventId;
        if (!activeId) {
            return;
        }
        const current = latestEventsSnapshot.events.find(entry => entry.id === activeId);
        const currentDisplay = getExternalEventName() || current?.displayName || current?.name || "";
        const input = window.prompt("Anzeigename der Veranstaltung", currentDisplay);
        if (input == null) {
            return;
        }
        const trimmed = input.trim();
        const fallback = current?.name || currentDisplay;
        const finalName = trimmed || fallback || "";
        setEventDisplayName(activeId, finalName);
    });

    const updateCacheButtons = summary => {
        const available = !!summary?.available;
        const entries = Array.isArray(summary?.entries) ? summary.entries : [];
        const hasEntries = entries.length > 0;

        if (eventStartCacheButton) {
            eventStartCacheButton.hidden = !available;
            eventStartCacheButton.disabled = !available;
            if (!available) {
                eventStartCacheButton.title = "Browser-Cache nicht verfügbar";
            } else if (!hasEntries) {
                eventStartCacheButton.title = "Keine Veranstaltungen im Cache vorhanden.";
            } else {
                eventStartCacheButton.removeAttribute("title");
            }
        }

        if (eventStartCacheDeleteButton) {
            eventStartCacheDeleteButton.hidden = !available;
            eventStartCacheDeleteButton.disabled = !available;
            if (!available) {
                eventStartCacheDeleteButton.title = "Browser-Cache nicht verfügbar";
            } else if (!hasEntries) {
                eventStartCacheDeleteButton.title = "Keine Veranstaltungen im Cache vorhanden.";
            } else {
                eventStartCacheDeleteButton.removeAttribute("title");
            }
        }

        if (eventAddCacheButton) {
            eventAddCacheButton.hidden = !available;
            eventAddCacheButton.disabled = !available;
            if (!available) {
                eventAddCacheButton.title = "Browser-Cache nicht verfügbar";
            } else if (!hasEntries) {
                eventAddCacheButton.title = "Keine Veranstaltungen im Cache vorhanden.";
            } else {
                eventAddCacheButton.removeAttribute("title");
            }
        }

        if (cacheRemoveActionButton) {
            cacheRemoveActionButton.hidden = !available;
            cacheRemoveActionButton.disabled = !available;
            if (!available) {
                cacheRemoveActionButton.title = "Browser-Cache nicht verfügbar";
            } else if (!hasEntries) {
                cacheRemoveActionButton.title = "Keine Veranstaltungen im Cache vorhanden.";
            } else {
                cacheRemoveActionButton.removeAttribute("title");
            }
        }
    };

    onCacheEntriesChange(updateCacheButtons);
    updateCacheButtons();

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
        if (eventRemoveButton) {
            eventRemoveButton.disabled = !activeEvent;
        }
        if (eventDisplayNameDisplay) {
            const displayName = activeEvent?.displayName ?? getExternalEventName();
            eventDisplayNameDisplay.textContent = displayName || "—";
        }
        if (eventDisplayNameButton) {
            eventDisplayNameButton.disabled = !activeEvent;
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

    logger.debug?.("[EventManagement] Initialisiert");

    return {
        updateCacheButtons,
        closeEventMenu,
    };
}
