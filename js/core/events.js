import { createEmptyEventState, loadEventState, setLastReservationsFilename } from "./state.js";

export const EVENT_TYPES = ["Lumpenball", "Fasching", "Narrengipfel", "Sonstiges"];
export const DEFAULT_EVENT_TYPE = EVENT_TYPES[0];

const ESCAPED_EVENT_TYPES = EVENT_TYPES.map(type => type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const EVENT_NAME_PATTERN_BODY = `(\\d{4}-\\d{2}-\\d{2})-(${ESCAPED_EVENT_TYPES.join("|")})`;
const EVENT_NAME_PATTERN = new RegExp(`^${EVENT_NAME_PATTERN_BODY}$`);
const RESERVATION_FILENAME_PATTERN = new RegExp(`^${EVENT_NAME_PATTERN_BODY}\\.json$`);

function normalizeDateInput(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        if (Number.isNaN(value.valueOf())) {
            return null;
        }
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) {
        return null;
    }
    const [, yearPart, monthPart, dayPart] = match;
    const year = Number.parseInt(yearPart, 10);
    const month = Number.parseInt(monthPart, 10);
    const day = Number.parseInt(dayPart, 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateString(value) {
    if (typeof value !== "string") {
        return false;
    }
    const trimmed = value.trim();
    const normalized = normalizeDateInput(trimmed);
    return normalized != null && normalized === trimmed;
}

export function buildEventName(date, type) {
    const normalizedDate = normalizeDateInput(date);
    if (!normalizedDate) {
        return null;
    }
    const normalizedType = EVENT_TYPES.includes(type) ? type : DEFAULT_EVENT_TYPE;
    return `${normalizedDate}-${normalizedType}`;
}

export function parseEventName(name) {
    if (typeof name !== "string") {
        return null;
    }
    const trimmed = name.trim();
    const match = trimmed.match(EVENT_NAME_PATTERN);
    if (!match) {
        return null;
    }
    const [, date, type] = match;
    return { date, type };
}

export function parseReservationsFilename(filename) {
    if (typeof filename !== "string") {
        return null;
    }
    const trimmed = filename.trim();
    const match = trimmed.match(RESERVATION_FILENAME_PATTERN);
    if (!match) {
        return null;
    }
    const [, date, type] = match;
    const eventName = `${date}-${type}`;
    return { date, type, eventName, filename: `${eventName}.json` };
}

export function isValidEventName(name) {
    return parseEventName(name) != null;
}

export function isValidReservationsFilename(filename) {
    return parseReservationsFilename(filename) != null;
}

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
    const parsed = parseEventName(name);
    return parsed ? `${parsed.date}-${parsed.type}.json` : null;
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
    const today = new Date();
    today.setDate(today.getDate() + (defaultEventCounter - 1));
    const isoDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    defaultEventCounter += 1;
    return buildEventName(isoDate, DEFAULT_EVENT_TYPE) || `Veranstaltung ${Date.now()}`;
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
        name: isValidEventName(providedName) ? providedName : autoName,
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
    if (!trimmed || trimmed === event.name || !isValidEventName(trimmed)) {
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