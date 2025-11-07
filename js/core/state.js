// ---------------------------------------------
// Core State & Utils (DOM-frei)
// ---------------------------------------------

const DEFAULT_TABLES = [
    //[nummer, plätze, position, gangDaneben]
    [0, 76, "standing", null],
    [1, 18, "left", null],
    [2, 18, "left", null],
    [3, 18, "left", null],
    [4, 18, "left", null],
    [5, 18, "left", null],
    [6, 18, "middle", null],
    [7, 18, "middle", null],
    [8, 24, "middle", null],
    [9, 24, "middle", null],
    [10, 24, "middle", null],
    [11, 24, "middle", null],
    [12, 18, "middle", null],
    [13, 18, "middle", null],
    [14, 12, "right", null],
    [15, 18, "right", null],
    [16, 18, "right", "oben"],
    [17, 18, "right", null]
];

function cloneTables(src = DEFAULT_TABLES) {
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

export function getCurrentEventState() {
    return currentEventState;
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

console.log("[INIT] App gestartet. Ausgangsdaten (Tische):", JSON.parse(JSON.stringify(tisch)));
