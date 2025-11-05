import { createEmptyEventState, loadEventState } from "./state.js";

const listeners = new Set();
let events = [];
let activeEventId = null;
let defaultEventCounter = 1;

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

    events.push(event);
    setActiveEvent(event.id);
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
    notifyListeners();
    return true;
}

export function hasEvents() {
    return events.length > 0;
}

export function getEventById(id) {
    return events.find(entry => entry.id === id) || null;
}