import { onEventStateDirty, getCurrentEventState } from "../core/state.js";
import { getActiveEvent } from "../core/events.js";

const CACHE_PREFIX = "skv-event-cache:";
const MAX_CACHE_ENTRIES = 25;
const SAVE_DEBOUNCE_MS = 400;

let storageAvailable = null;
let pendingSave = null;
const cacheListeners = new Set();

function detectStorage() {
    if (storageAvailable != null) {
        return storageAvailable;
    }
    try {
        if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
            storageAvailable = false;
            return storageAvailable;
        }
        const probeKey = `${CACHE_PREFIX}__probe__`;
        window.localStorage.setItem(probeKey, "1");
        window.localStorage.removeItem(probeKey);
        storageAvailable = true;
    } catch (err) {
        console.warn("[CACHE] localStorage nicht verfügbar:", err);
        storageAvailable = false;
    }
    return storageAvailable;
}

function getStorage() {
    return detectStorage() ? window.localStorage : null;
}

function buildKey(name) {
    return `${CACHE_PREFIX}${name}`;
}

function normalizeEventName(name) {
    return typeof name === "string" ? name.trim() : "";
}

function safeParse(raw, key) {
    if (typeof raw !== "string") {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.warn("[CACHE] Konnte Eintrag nicht parsen:", key, err);
        return null;
    }
}

function listCacheMetas() {
    const storage = getStorage();
    if (!storage) {
        return [];
    }
    const entries = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(CACHE_PREFIX)) {
            continue;
        }
        const raw = storage.getItem(key);
        const parsed = safeParse(raw, key);
        const eventName = normalizeEventName(parsed?.event?.name);
        if (!parsed || !eventName) {
            continue;
        }
        entries.push({
            key,
            name: eventName,
            displayName: typeof parsed.event.displayName === "string"
                ? parsed.event.displayName
                : eventName,
            savedAt: parsed.savedAt || null,
        });
    }
    entries.sort((a, b) => {
        const timeA = a.savedAt ? Date.parse(a.savedAt) : 0;
        const timeB = b.savedAt ? Date.parse(b.savedAt) : 0;
        return timeB - timeA;
    });
    return entries;
}

function getCacheEntry(name) {
    const storage = getStorage();
    if (!storage) {
        return null;
    }
    const normalized = normalizeEventName(name);
    if (!normalized) {
        return null;
    }
    const key = buildKey(normalized);
    const raw = storage.getItem(key);
    const parsed = safeParse(raw, key);
    const parsedName = normalizeEventName(parsed?.event?.name);
    if (!parsed || !parsedName) {
        return null;
    }
    if (!parsed.event.state || typeof parsed.event.state !== "object") {
        return null;
    }
    return {
        key,
        name: parsedName,
        displayName: typeof parsed.event.displayName === "string"
            ? parsed.event.displayName
            : parsedName,
        savedAt: parsed.savedAt || null,
        state: parsed.event.state,
    };
}

function removeCacheEntryByKey(key) {
    const storage = getStorage();
    if (!storage || !key) {
        return;
    }
    try {
        storage.removeItem(key);
    } catch (err) {
        console.warn("[CACHE] Entfernen fehlgeschlagen:", key, err);
    }
}

function trimCacheEntries() {
    const storage = getStorage();
    if (!storage) {
        return;
    }
    const entries = listCacheMetas();
    if (entries.length <= MAX_CACHE_ENTRIES) {
        return;
    }
    const overflow = entries.slice(MAX_CACHE_ENTRIES);
    overflow.forEach(entry => removeCacheEntryByKey(entry.key));
}

function buildSummary() {
    const available = detectStorage();
    return {
        available,
        entries: available ? listCacheMetas() : [],
    };
}

function notifyCacheListeners() {
    const summary = buildSummary();
    for (const cb of cacheListeners) {
        try {
            cb(summary);
        } catch (err) {
            console.error("[CACHE] Listener error", err);
        }
    }
}

export function onCacheEntriesChange(cb) {
    if (typeof cb !== "function") {
        return () => {};
    }
    cacheListeners.add(cb);
    try {
        cb(buildSummary());
    } catch (err) {
        console.error("[CACHE] Listener error", err);
    }
    return () => cacheListeners.delete(cb);
}

function serializeState(state) {
    try {
        return JSON.stringify(state);
    } catch (err) {
        console.warn("[CACHE] Serialisierung fehlgeschlagen:", err);
        return null;
    }
}

function persistActiveEvent(reason = "manual") {
    const storage = getStorage();
    if (!storage) {
        return false;
    }
    const active = getActiveEvent();
    if (!active || !active.name) {
        return false;
    }
    const eventName = normalizeEventName(active.name);
    if (!eventName) {
        return false;
    }
    const stateSource = active.state && typeof active.state === "object"
        ? active.state
        : getCurrentEventState();
    const serializedState = serializeState(stateSource);
    if (!serializedState) {
        return false;
    }
    const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        reason,
        event: {
            name: eventName,
            displayName: active.displayName || eventName,
            state: JSON.parse(serializedState),
        },
    };
    try {
        storage.setItem(buildKey(eventName), JSON.stringify(payload));
        trimCacheEntries();
        notifyCacheListeners();
        console.log("[CACHE] Veranstaltung gespeichert:", { name: eventName, reason });
        return true;
    } catch (err) {
        console.warn("[CACHE] Speichern fehlgeschlagen:", err);
        return false;
    }
}

function schedulePersist(reason = "auto") {
    if (!detectStorage()) {
        return;
    }
    if (pendingSave) {
        clearTimeout(pendingSave);
    }
    pendingSave = setTimeout(() => {
        pendingSave = null;
        persistActiveEvent(reason);
    }, SAVE_DEBOUNCE_MS);
}

let initialized = false;

export function setupEventCacheAutoSave() {
    if (initialized) {
        return;
    }
    initialized = true;
    if (!detectStorage()) {
        notifyCacheListeners();
        return;
    }
    onEventStateDirty(({ reason }) => {
        schedulePersist(reason || "state-dirty");
    });
    schedulePersist("init");
    notifyCacheListeners();
}

function formatEntryLine(entry, index) {
    const date = entry.savedAt ? new Date(entry.savedAt) : null;
    const formatted = date ? date.toLocaleString("de-DE") : "Unbekannt";
    const label = entry.displayName && entry.displayName !== entry.name
        ? `${entry.displayName} [${entry.name}]`
        : entry.name;
    return `${index + 1}. ${label} (${formatted})`;
}

export function promptLoadFromCache() {
    const summary = buildSummary();
    if (!summary.available) {
        alert("Der Browser-Cache ist nicht verfügbar.");
        return null;
    }
    if (!summary.entries.length) {
        alert("Es sind keine Veranstaltungen im Browser-Cache gespeichert.");
        return null;
    }
    const messageLines = summary.entries.map((entry, index) => formatEntryLine(entry, index));
    const input = window.prompt(
        `Gespeicherte Veranstaltungen:\n\n${messageLines.join("\n")}\n\nBitte die Nummer der gewünschten Veranstaltung eingeben:`
    );
    if (input == null) {
        return null;
    }
    const index = Number.parseInt(input, 10);
    if (!Number.isInteger(index) || index < 1 || index > summary.entries.length) {
        alert("Ungültige Auswahl.");
        return null;
    }
    const selectedMeta = summary.entries[index - 1];
    const entry = getCacheEntry(selectedMeta.name);
    if (!entry) {
        alert("Der ausgewählte Cache-Eintrag konnte nicht geladen werden.");
        removeCacheEntryByKey(selectedMeta.key);
        notifyCacheListeners();
        return null;
    }
    return entry;
}

export function promptRemoveCacheEntry() {
    const summary = buildSummary();
    if (!summary.available) {
        alert("Der Browser-Cache ist nicht verfügbar.");
        return false;
    }
    if (!summary.entries.length) {
        alert("Es sind keine Veranstaltungen im Browser-Cache gespeichert.");
        return false;
    }
    const messageLines = summary.entries.map((entry, index) => formatEntryLine(entry, index));
    const input = window.prompt(
        `Gespeicherte Veranstaltungen:\n\n${messageLines.join("\n")}\n\nBitte die Nummer der zu löschenden Veranstaltung eingeben:`
    );
    if (input == null) {
        return false;
    }
    const index = Number.parseInt(input, 10);
    if (!Number.isInteger(index) || index < 1 || index > summary.entries.length) {
        alert("Ungültige Auswahl.");
        return false;
    }
    const selectedMeta = summary.entries[index - 1];
    const label = selectedMeta.displayName && selectedMeta.displayName !== selectedMeta.name
        ? `${selectedMeta.displayName} (${selectedMeta.name})`
        : selectedMeta.name;
    const confirmed = window.confirm(`Soll die Veranstaltung "${label}" wirklich aus dem Cache gelöscht werden?`);
    if (!confirmed) {
        return false;
    }
    removeCacheEntryByKey(selectedMeta.key);
    notifyCacheListeners();
    return true;
}

export function removeCacheEntry(name) {
    const storage = getStorage();
    if (!storage) {
        return false;
    }
    const normalized = normalizeEventName(name);
    if (!normalized) {
        return false;
    }
    const key = buildKey(normalized);
    const exists = storage.getItem(key) != null;
    if (!exists) {
        return false;
    }
    removeCacheEntryByKey(key);
    notifyCacheListeners();
    return true;
}

export function forcePersistActiveEvent(reason = "manual") {
    return persistActiveEvent(reason);
}
