// ---------------------------------------------
// Core State & Utils (DOM-frei)
// ---------------------------------------------

// Globale Zustände (Tisch 0 sind Stehplätze)
export let tisch = [
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

export let alleAktionen = "";
export let alleExportCodes = "";

// Reservierungen: { [tischnr]: [{ id, bookingId, name, cards, notes, ts }] }
export let reservationsByTable = {};

// Kartenpreis (EUR)
export let cardPriceValue = 19.5;
const cardPriceListeners = new Set();

export function getCardPriceValue() {
    return cardPriceValue;
}

export function setCardPriceValue(value) {
    if (!Number.isFinite(value) || value < 0) {
        return;
    }
    cardPriceValue = value;
    for (const cb of cardPriceListeners) {
        try {
            cb(cardPriceValue);
        } catch (err) {
            console.error("[CARD PRICE] Listener error", err);
        }
    }
}

export function onCardPriceChange(cb) {
    if (typeof cb !== "function") return () => {};
    cardPriceListeners.add(cb);
    return () => cardPriceListeners.delete(cb);
}

// ---------- Booking-ID Sequenz ----------
export let lastBookingSeq = 0; // höchste vergebene Nummer (001 => 1, ...)

export function nextBookingId() {
    lastBookingSeq = Math.max(0, lastBookingSeq) + 1;
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
}

// ---------- Merker für zuletzt importierten Reservierungs-Dateinamen ----------
export let lastReservationsFilename = null;

export function setLastReservationsFilename(name) {
    lastReservationsFilename = name || null;
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

export function buildSplitInfoText(bookingId, currentTable) {
    if (!bookingId) return "";
    const parts = [];
    for (const key of Object.keys(reservationsByTable)) {
        const tableNr = parseInt(key, 10);
        if (!Number.isInteger(tableNr) || tableNr === currentTable) continue;
        const arr = reservationsByTable[tableNr] || [];
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
