import {tisch, reservationsByTable, buildSplitInfoText} from "../core/state.js";

const CHANNEL_NAME = "skv-internal-plan";
const STORAGE_KEY = "skv-internal-plan-message";
const MESSAGE_MARKER = "__skvInternalPlan";
const MAX_SEEN_MESSAGES = 200;
const TAB_URL = "sync/saalplan_intern.html";

const COLOR_PRESETS = {
    red: {primary: "#E53935"},
    blue: {primary: "#1E88E5"},
    yellow: {primary: "#FDD835"},
    orange: {primary: "#FB8C00"},
    purple: {primary: "#8E24AA"},
    green: {primary: "#43A047"},
    gray: {primary: "#757575"},
};

const EVEN_TABLE_COLOR_SEQUENCE = [
    COLOR_PRESETS.red,
    COLOR_PRESETS.blue,
    COLOR_PRESETS.yellow,
    COLOR_PRESETS.orange,
    COLOR_PRESETS.purple,
    COLOR_PRESETS.green,
    COLOR_PRESETS.gray,
];

const ODD_TABLE_COLOR_SEQUENCE = [
    COLOR_PRESETS.orange,
    COLOR_PRESETS.purple,
    COLOR_PRESETS.green,
    COLOR_PRESETS.red,
    COLOR_PRESETS.blue,
    COLOR_PRESETS.yellow,
    COLOR_PRESETS.gray,
];

function parseTableNumber(tableNr) {
    if (Number.isInteger(tableNr)) {
        return tableNr;
    }

    if (typeof tableNr === "string") {
        const trimmed = tableNr.trim();
        if (!trimmed) return null;

        const direct = Number(trimmed);
        if (Number.isInteger(direct)) {
            return direct;
        }

        const match = trimmed.match(/-?\d+/);
        if (match) {
            const parsed = Number(match[0]);
            if (Number.isInteger(parsed)) {
                return parsed;
            }
        }
    }

    return null;
}

let channel = null;
let lastSignature = null;
let storageListenerBound = false;
let lastPayload = null;
const seenMessageIds = new Set();
const seenMessageQueue = [];

function rememberMessageId(id) {
    if (!id) return;
    if (seenMessageIds.has(id)) return;
    seenMessageIds.add(id);
    seenMessageQueue.push(id);
    if (seenMessageQueue.length > MAX_SEEN_MESSAGES) {
        const oldest = seenMessageQueue.shift();
        if (oldest !== undefined) {
            seenMessageIds.delete(oldest);
        }
    }
}

function hasSeenMessage(id) {
    if (!id) return false;
    return seenMessageIds.has(id);
}

function createEnvelope(data) {
    return {
        marker: MESSAGE_MARKER,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        data,
    };
}

function transmitEnvelope(envelope) {
    const bc = ensureChannel();
    if (bc && envelope) {
        try {
            bc.postMessage(envelope);
        } catch (err) {
            console.warn("[SYNC] BroadcastChannel konnte Nachricht nicht senden:", err);
        }
    }

    if (!envelope) return;

    if (typeof localStorage === "undefined" || localStorage === null) {
        return;
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (err) {
        if (err?.name !== "SecurityError") {
            console.warn("[SYNC] localStorage-Fallback konnte Nachricht nicht senden:", err);
        }
    }
}

function setupStorageListener() {
    if (storageListenerBound) return;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
        return;
    }
    window.addEventListener("storage", onStorageMessage);
    storageListenerBound = true;
}

function ensureChannel() {
    setupStorageListener();

    if (typeof BroadcastChannel === "undefined") {
        return null;
    }
    if (!channel) {
        try {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.addEventListener("message", onChannelMessage);
            window.addEventListener("beforeunload", () => {
                try {
                    channel?.close();
                } catch (err) {
                    console.warn("[SYNC] BroadcastChannel konnte nicht geschlossen werden:", err);
                }
            }, {once: true});
        } catch (err) {
            console.warn("[SYNC] BroadcastChannel konnte nicht initialisiert werden:", err);
            channel = null;
        }
    }
    return channel;
}

function handleIncomingPayload(payload) {
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "request_state") {
        broadcastInternalPlanState("request-response");
        return;
    }

    if (payload.type === "select-table") {
        const tableNr = parseTableNumber(payload.tableNr);
        if (!Number.isInteger(tableNr)) {
            return;
        }

        const detail = {tableNr};
        const customEvent = new CustomEvent("internal-plan:select-table", {detail});
        window.dispatchEvent(customEvent);
        return;
    }

    if (payload.type === "search-booking") {
        const query = typeof payload.query === "string" ? payload.query : String(payload.query ?? "");
        const detail = {query};
        const customEvent = new CustomEvent("internal-plan:search-booking", {detail});
        window.dispatchEvent(customEvent);
    }
}

function handleEnvelope(envelope) {
    if (!envelope || envelope.marker !== MESSAGE_MARKER) return;
    if (hasSeenMessage(envelope.id)) return;
    rememberMessageId(envelope.id);
    handleIncomingPayload(envelope.data);
}

function onChannelMessage(event) {
    handleEnvelope(event?.data);
}

function onStorageMessage(event) {
    if (!event || event.key !== STORAGE_KEY) return;
    if (!event.newValue) return;
    try {
        const parsed = JSON.parse(event.newValue);
        handleEnvelope(parsed);
    } catch (err) {
        console.warn("[SYNC] Konnte Nachricht aus localStorage nicht verarbeiten:", err);
    }
}

function sumCards(list, filterFn = null) {
    if (!Array.isArray(list)) return 0;
    return list.reduce((sum, entry) => {
        if (filterFn && !filterFn(entry)) return sum;
        const cards = parseInt(entry?.cards, 10);
        return sum + (Number.isFinite(cards) ? cards : 0);
    }, 0);
}

function getColorSequenceForTable(tableNr) {
    const nr = parseInt(tableNr, 10);
    if (!Number.isFinite(nr)) {
        return EVEN_TABLE_COLOR_SEQUENCE;
    }
    return Math.abs(nr) % 2 === 0 ? EVEN_TABLE_COLOR_SEQUENCE : ODD_TABLE_COLOR_SEQUENCE;
}

function buildSeatSegments(list, freeSeats, tableNr) {
    const segments = [];
    let paletteIndex = 0;
    const paletteSequence = getColorSequenceForTable(tableNr);

    if (Array.isArray(list)) {
        for (const entry of list) {
            const count = Math.max(parseInt(entry?.cards, 10) || 0, 0);
            if (!count) continue;

            const splitInfo = buildSplitInfoText(entry?.bookingId, tableNr);

            const segment = {
                type: entry?.sold ? "sold" : "reserved",
                count,
                bookingId: entry?.bookingId ?? null,
                name: entry?.name ?? "",
                notes: entry?.notes ?? "",
                sold: !!entry?.sold,
            };

            if (splitInfo) {
                segment.splitInfo = splitInfo;
            }

            if (!segment.sold) {
                const palette = paletteSequence[paletteIndex % paletteSequence.length];
                paletteIndex += 1;
                segment.colorPrimary = palette.primary;
            }

            segments.push(segment);
        }
    }

    const free = Math.max(parseInt(freeSeats, 10) || 0, 0);
    if (free > 0) {
        segments.push({type: "free", count: free});
    }

    return segments;
}

function buildTablePayload() {
    return tisch.map(([nr, freeSeats, position, gangDaneben]) => {
        const list = reservationsByTable[nr] || [];
        const reserved = sumCards(list);
        const sold = sumCards(list, r => !!r?.sold);
        const free = Math.max(parseInt(freeSeats, 10) || 0, 0);
        const total = Math.max(free + reserved, 0);
        return {
            nr,
            free,
            reserved,
            sold,
            total,
            position: nr === 0 ? "standing" : (position || "middle"),
            gangDaneben: gangDaneben || null,
            segments: buildSeatSegments(list, free, nr),
        };
    }).sort((a, b) => a.nr - b.nr);
}

function createPayload(reason) {
    const payload = {
        reason,
        generatedAt: Date.now(),
        tables: buildTablePayload(),
    };
    return payload;
}

export function broadcastInternalPlanState(reason = "update") {
    ensureChannel();
    const payload = createPayload(reason);
    const signature = JSON.stringify(payload.tables);
    if (signature === lastSignature && reason !== "request-response") {
        return;
    }
    lastSignature = signature;
    lastPayload = payload;
    const envelope = createEnvelope({ type: "state", payload });
    transmitEnvelope(envelope);
}

export function setupInternalPlanSync() {
    ensureChannel();
    if (lastPayload === null) {
        broadcastInternalPlanState("init");
    }
}

export function openInternalPlanTab() {
    const win = window.open(TAB_URL, "skv-internal-plan");
    if (win && typeof win === "object") {
        try {
            win.opener = null;
        } catch (err) { /* ignore */
        }
    }
    broadcastInternalPlanState("open-tab");
    return win;
}

export function getInternalPlanChannelName() {
    return CHANNEL_NAME;
}