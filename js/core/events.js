import { createEmptyEventState, loadEventState, setLastReservationsFilename } from "./state.js";

const listeners = new Set();
let events = [];
let activeEventId = null;
let defaultEventCounter = 1;

function normalizeEventNameForFilename(name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) {
        return "";
    }
    return trimmed
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^0-9A-Za-z._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.-]+|[.-]+$/g, "");
}

function defaultReservationsFilenameForName(name) {
    const base = normalizeEventNameForFilename(name);
    return base ? `${base}-reservierungen.json` : null;
}

function syncDefaultReservationsFilename(event) {
    if (!event || !event.state || typeof event.state !== "object") {
        return;
    }
    const defaultFilename = defaultReservationsFilenameForName(event.name);
    if (defaultFilename) {
        event.state.lastReservationsFilename = defaultFilename;
        if (event.id === activeEventId) {
            setLastReservationsFilename(defaultFilename);
        }
    }
}

export function getEventNameFileBase(name) {
    return normalizeEventNameForFilename(name);
}

export function getActiveEventFileSafeName() {
    const active = getActiveEvent();
    return active ? normalizeEventNameForFilename(active.name) : "";
}

function generateEventId() {
    return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function allocateDefaultName() {
    const name = `Veranstaltung ${defaultEventCounter}`;
    defaultEventCounter += 1;
    return name;
}

export function getNextDefaultEventName() {
    return `Veranstaltung ${defaultEventCounter}`;
}

function buildSnapshot() {
    return {
        events: events.map(event => ({ id: event.id, name: event.name })),
        activeEventId,
    };
}

function notifyListeners() {
    const snapshot = buildSnapshot();
    for (const cb of listeners) {
        try {
            cb(snapshot);
        } catch (err) {
            console.error("[EVENTS] Listener error", err);
        }
    }
}

export function onEventsChange(cb) {
    if (typeof cb !== "function") {
        return () => {};
    }
    listeners.add(cb);
    try {
        cb(buildSnapshot());
    } catch (err) {
        console.error("[EVENTS] Listener error", err);
    }
    return () => listeners.delete(cb);
}

export function getEventsSnapshot() {
    return buildSnapshot();
}

export function getActiveEvent() {
    return events.find(event => event.id === activeEventId) || null;
}

export function setActiveEvent(id) {
    if (activeEventId === id) {
        const existing = getActiveEvent();
        return existing != null;
    }
    const event = events.find(entry => entry.id === id);
    if (!event) {
        return false;
    }
    activeEventId = event.id;
    loadEventState(event.state);
    notifyListeners();
    return true;
}

export function createEvent(options = {}) {
    const autoName = allocateDefaultName();
    const providedName = typeof options.name === "string" ? options.name.trim() : "";
    const state = options.state && typeof options.state === "object"
        ? options.state
        : createEmptyEventState();

    const event = {
        id: generateEventId(),
        name: providedName || autoName,
        state,
    };

    if (!event.state || typeof event.state !== "object") {
        event.state = createEmptyEventState();
    }

    if (!event.state.lastReservationsFilename) {
        const defaultFilename = defaultReservationsFilenameForName(event.name);
        if (defaultFilename) {
            event.state.lastReservationsFilename = defaultFilename;
        }
    }

    events.push(event);
    setActiveEvent(event.id);
    if (event.state.lastReservationsFilename) {
        setLastReservationsFilename(event.state.lastReservationsFilename);
    }
    return event;
}

export function renameEvent(id, name) {
    const event = events.find(entry => entry.id === id);
    if (!event) {
        return false;
    }
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed || trimmed === event.name) {
        return false;
    }
    event.name = trimmed;
    syncDefaultReservationsFilename(event);
    notifyListeners();
    return true;
}

export function hasEvents() {
    return events.length > 0;
}

export function getEventById(id) {
    return events.find(entry => entry.id === id) || null;
}