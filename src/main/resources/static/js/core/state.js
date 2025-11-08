// ---------------------------------------------
// Core State & Utils (DOM-frei)
// ---------------------------------------------

const FALLBACK_TABLES = [
    //[nummer, plätze, position, gangDaneben]
    [0, 0, "standing", null]
];

function cloneTables(src = FALLBACK_TABLES) {
    return src.map(row => Array.isArray(row) ? [...row] : row);
}

export function createEmptyEventState() {
    return {
        tisch: cloneTables(),
        alleAktionen: "",
        alleExportCodes: "",
        reservationsByTable: {},
        cardPriceValue: 19.5,
        externalEventName: "",
        lastBookingSeq: 0,
        lastReservationsFilename: null,
    };
}

let currentEventState = createEmptyEventState();

let eventStateInitPromise = null;

function normalizeTableRow(row) {
    if (Array.isArray(row)) {
        const [number, seats, position = "middle", aisleNeighbor = null] = row;
        const num = Number(number);
        const seatCount = Number(seats);
        if (!Number.isInteger(num) || !Number.isInteger(seatCount)) {
            return null;
        }
        const pos = typeof position === "string" ? position : "middle";
        return [num, seatCount, pos, aisleNeighbor ?? null];
    }
    if (row && typeof row === "object") {
        const rawNumber = row.number ?? row.nr ?? row.table ?? row.id;
        const rawSeats = row.seats ?? row.places ?? row.plaetze;
        const num = Number(rawNumber);
        const seatCount = Number(rawSeats);
        if (!Number.isInteger(num) || !Number.isInteger(seatCount)) {
            return null;
        }
        const position = typeof row.position === "string" ? row.position : "middle";
        const aisle = row.aisleNeighbor ?? row.gangDaneben ?? null;
        return [num, seatCount, position, aisle == null ? null : aisle];
    }
    return null;
}

function normalizeTablesFromPayload(rows) {
    const normalized = [];
    if (Array.isArray(rows)) {
        for (const row of rows) {
            const normalizedRow = normalizeTableRow(row);
            if (normalizedRow) {
                normalized.push(normalizedRow);
            }
        }
    }
    if (!normalized.length) {
        return cloneTables();
    }
    normalized.sort((a, b) => a[0] - b[0]);
    const standingIndex = normalized.findIndex(entry => entry[0] === 0);
    if (standingIndex > 0) {
        const [standing] = normalized.splice(standingIndex, 1);
        normalized.unshift(standing);
    }
    return normalized;
}

function cloneReservationsMap(source) {
    if (!source || typeof source !== "object") {
        return {};
    }
    const result = {};
    for (const [key, value] of Object.entries(source)) {
        if (!Array.isArray(value)) {
            continue;
        }
        result[key] = value.map(item => ({ ...(item || {}) }));
    }
    return result;
}

function buildStateFromPayload(payload) {
    const state = createEmptyEventState();
    if (!payload || typeof payload !== "object") {
        return state;
    }
    const tables = normalizeTablesFromPayload(payload.tisch);
    state.tisch = cloneTables(tables);
    if (typeof payload.alleAktionen === "string") {
        state.alleAktionen = payload.alleAktionen;
    }
    if (typeof payload.alleExportCodes === "string") {
        state.alleExportCodes = payload.alleExportCodes;
    }
    state.reservationsByTable = cloneReservationsMap(payload.reservationsByTable);
    if (Number.isFinite(payload.cardPriceValue)) {
        state.cardPriceValue = payload.cardPriceValue;
    }
    if (typeof payload.externalEventName === "string") {
        state.externalEventName = payload.externalEventName;
    }
    if (Number.isInteger(payload.lastBookingSeq)) {
        state.lastBookingSeq = payload.lastBookingSeq;
    }
    if (payload.lastReservationsFilename == null || typeof payload.lastReservationsFilename === "string") {
        state.lastReservationsFilename = payload.lastReservationsFilename ?? null;
    }
    return state;
}

async function fetchEventStateFromServer() {
    if (typeof fetch !== "function") {
        throw new Error("Fetch API not available");
    }
    const response = await fetch("/api/event-state", {
        headers: { "Accept": "application/json" },
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
    }
    return response.json();
}

export async function ensureEventStateLoaded() {
    if (!eventStateInitPromise) {
        eventStateInitPromise = (async () => {
            try {
                const payload = await fetchEventStateFromServer();
                const state = buildStateFromPayload(payload);
                loadEventState(state);
                console.log(`[STATE] Initialdaten vom Server geladen (${state.tisch.length} Tische).`);
            } catch (err) {
                console.warn("[STATE] Konnte Initialdaten nicht laden, nutze Fallback.", err);
                loadEventState(createEmptyEventState());
            }
            return getCurrentEventState();
        })();
    }
    return eventStateInitPromise;
}


export function getCurrentEventState() {
    return currentEventState;
}

const eventStateDirtyListeners = new Set();

function notifyEventStateDirty(reason = "unknown") {
    for (const cb of eventStateDirtyListeners) {
        try {
            cb({ reason, state: currentEventState });
        } catch (err) {
            console.error("[STATE] Dirty listener error", err);
        }
    }
}

export function onEventStateDirty(cb) {
    if (typeof cb !== "function") {
        return () => {};
    }
    eventStateDirtyListeners.add(cb);
    return () => eventStateDirtyListeners.delete(cb);
}

export function markEventStateDirty(reason = "unknown") {
    notifyEventStateDirty(reason);
}

export let tisch = currentEventState.tisch;
export let alleAktionen = currentEventState.alleAktionen;
export let alleExportCodes = currentEventState.alleExportCodes;
// Reservierungen: { [tischnr]: [{ id, bookingId, name, cards, notes, ts }] }
export let reservationsByTable = currentEventState.reservationsByTable;

// Kartenpreis (EUR)
export let cardPriceValue = currentEventState.cardPriceValue;
const cardPriceListeners = new Set();

export let externalEventName = typeof currentEventState.externalEventName === "string"
    ? currentEventState.externalEventName
    : "";
const externalEventNameListeners = new Set();

export let lastBookingSeq = currentEventState.lastBookingSeq;

export let lastReservationsFilename = currentEventState.lastReservationsFilename;

function ensureEventStateShape(state) {
    if (!Array.isArray(state.tisch)) {
        state.tisch = cloneTables();
    }
    if (typeof state.alleAktionen !== "string") {
        state.alleAktionen = "";
    }
    if (typeof state.alleExportCodes !== "string") {
        state.alleExportCodes = "";
    }
    if (!state.reservationsByTable || typeof state.reservationsByTable !== "object") {
        state.reservationsByTable = {};
    }
    if (!Number.isFinite(state.cardPriceValue) || state.cardPriceValue < 0) {
        state.cardPriceValue = 19.5;
    }
    if (typeof state.externalEventName !== "string") {
        state.externalEventName = "";
    }
    if (!Number.isInteger(state.lastBookingSeq)) {
        state.lastBookingSeq = 0;
    }
    if (state.lastReservationsFilename != null && typeof state.lastReservationsFilename !== "string") {
        state.lastReservationsFilename = null;
    }
}

function assignStateReferences(state) {
    tisch = state.tisch;
    alleAktionen = state.alleAktionen;
    alleExportCodes = state.alleExportCodes;
    reservationsByTable = state.reservationsByTable;
    cardPriceValue = state.cardPriceValue;
    externalEventName = typeof state.externalEventName === "string" ? state.externalEventName : "";
    lastBookingSeq = state.lastBookingSeq;
    lastReservationsFilename = state.lastReservationsFilename;
}

function notifyCardPriceListeners() {
    for (const cb of cardPriceListeners) {
        try {
            cb(cardPriceValue);
        } catch (err) {
            console.error("[CARD PRICE] Listener error", err);
        }
    }
}

function notifyExternalEventNameListeners() {
    for (const cb of externalEventNameListeners) {
        try {
            cb(getExternalEventName());
        } catch (err) {
            console.error("[EVENT DISPLAY NAME] Listener error", err);
        }
    }
}

export function loadEventState(state) {
    if (!state || typeof state !== "object") {
        currentEventState = createEmptyEventState();
    } else {
        currentEventState = state;
    }
    ensureEventStateShape(currentEventState);
    assignStateReferences(currentEventState);
    notifyExternalEventNameListeners();
    notifyCardPriceListeners();
}

export function getCardPriceValue() {
    return cardPriceValue;
}

export function setCardPriceValue(value) {
    if (!Number.isFinite(value) || value < 0) {
        return;
    }
    cardPriceValue = value;
    currentEventState.cardPriceValue = value;
    notifyCardPriceListeners();
    notifyEventStateDirty("card-price");
}

export function onCardPriceChange(cb) {
    if (typeof cb !== "function") {
        return () => {};
    }
    cardPriceListeners.add(cb);
    try {
        cb(cardPriceValue);
    } catch (err) {
        console.error("[CARD PRICE] Listener error", err);
    }
    return () => cardPriceListeners.delete(cb);
}

export function getExternalEventName() {
    return typeof externalEventName === "string" && externalEventName.trim()
        ? externalEventName.trim()
        : "";
}

export function setExternalEventName(value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    externalEventName = normalized;
    currentEventState.externalEventName = normalized;
    notifyExternalEventNameListeners();
    notifyEventStateDirty("external-event-name");
}

export function onExternalEventNameChange(cb) {
    if (typeof cb !== "function") {
        return () => {};
    }
    externalEventNameListeners.add(cb);
    try {
        cb(getExternalEventName());
    } catch (err) {
        console.error("[EVENT DISPLAY NAME] Listener error", err);
    }
    return () => externalEventNameListeners.delete(cb);
}

// ---------- Booking-ID Sequenz ----------
export function nextBookingId() {
    lastBookingSeq = Math.max(0, lastBookingSeq) + 1;
    currentEventState.lastBookingSeq = lastBookingSeq;
    return String(lastBookingSeq).padStart(3, "0");
}

// Kompatibilität, falls irgendwo noch genBookingId() genutzt wird
export function genBookingId() {
    return nextBookingId();
}

/** Setzt lastBookingSeq >= höchste vorhandene numerische bookingId in map */
export function bumpBookingSeqFromExisting(map) {
    let maxFound = lastBookingSeq;
    for (const key of Object.keys(map || {})) {
        const arr = map[key] || [];
        for (const r of arr) {
            const raw = String(r.bookingId ?? "");
            const m = raw.match(/^(\d{1,})$/);
            if (!m) continue;
            const num = parseInt(m[1], 10);
            if (Number.isInteger(num)) maxFound = Math.max(maxFound, num);
        }
    }
    lastBookingSeq = Math.max(lastBookingSeq, maxFound);
    currentEventState.lastBookingSeq = lastBookingSeq;
}

// ---------- Merker für zuletzt importierten Reservierungs-Dateinamen ----------
export function setLastReservationsFilename(name) {
    lastReservationsFilename = name || null;
    currentEventState.lastReservationsFilename = lastReservationsFilename;
    notifyEventStateDirty("reservations-filename");
}

// ---- Helpers (DOM-frei) ----
export function sortTischArrayPlace(arr) {
    // Schritt 1: nach zweitem Wert sortieren (absteigend)
    arr.sort((a, b) => b[1] - a[1]);

    // Schritt 2: Elemente mit a[0] === 0 nach hinten verschieben
    arr.sort((a, b) => {
        if (a[0] === 0 && b[0] !== 0) return 1;
        if (a[0] !== 0 && b[0] === 0) return -1;
        return 0;
    });
    return arr;
}

export function sortTischArrayNr(arr) {
    arr.sort((a, b) => a[0] - b[0]);
}

export function findIndexByTableNumber(num) {
    return tisch.findIndex(([n]) => n === num);
}

export function getSeatsByTableNumber(num) {
    const i = findIndexByTableNumber(num);
    return i >= 0 ? tisch[i][1] : null;
}

export function setSeatsByTableNumber(num, seats) {
    const i = findIndexByTableNumber(num);
    if (i >= 0) tisch[i][1] = seats;
}

export function ensureBucket(nr) {
    if (!reservationsByTable[nr]) reservationsByTable[nr] = [];
}

export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function escapeHtml(str) {
    if (typeof str !== "string") return str;
    return str
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// „Tischwunsch: Tisch X“ normalisieren
export function tableLabel(tableNr) {
    const num = Number(tableNr);
    if (Number.isInteger(num)) {
        return num === 0 ? "Stehplätze" : `Tisch ${num}`;
    }
    return `Tisch ${tableNr}`;
}

export function normalizeWishNote(note) {
    if (!note) return "";
    const re = /tischwunsch.*?\(?tisch\s*(\d+)\)?/i;
    const m = note.match(re);
    if (m) {
        const num = parseInt(m[1], 10);
        if (Number.isInteger(num)) {
            return num === 0 ? "Stehplätze" : `Tisch ${num}`;
        }
    }
    return note;
}

export function noteToHtml(note) {
    if (!note) return "";
    return escapeHtml(normalizeWishNote(note)).replace(/\n/g, "<br>");
}

export function buildSplitInfoText(bookingId, currentTable, sourceReservations = reservationsByTable) {
    if (!bookingId) return "";
    const source = sourceReservations && typeof sourceReservations === "object"
        ? sourceReservations
        : reservationsByTable;
    const parts = [];
    for (const key of Object.keys(source)) {
        const tableNr = parseInt(key, 10);
        if (!Number.isInteger(tableNr) || tableNr === currentTable) continue;
        const arr = source[tableNr] || [];
        for (const r of arr) {
            if (r.bookingId === bookingId) parts.push(`${tableLabel(tableNr)} (${r.cards})`);
        }
    }
    return parts.length ? `Weitere Plätze: ${parts.join(", ")}` : "";
}

export function fileTimestamp() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log("[DOWNLOAD] JSON:", filename, data);
}

export function pickJSONFile(cb) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const obj = JSON.parse(text);
            console.log("[UPLOAD] JSON geladen:", file.name, obj);
            // Dateiname als 2. Argument übergeben
            cb(obj, file.name);
        } catch (e) {
            console.error("[UPLOAD] Fehlerhafte JSON:", e);
            alert("Ungültige oder beschädigte JSON-Datei.");
        }
    }, {once: true});
    input.click();
}

