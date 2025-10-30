import {
    tisch,
    reservationsByTable,
    buildSplitInfoText,
    tableLabel,
    getCardPriceValue,
    onCardPriceChange,
} from "../core/state.js";
import { getCartEntries, onCartChange } from "./cart.js";

const CHANNEL_NAME = "skv-external-plan";
const STORAGE_KEY = "skv-external-plan-message";
const MESSAGE_MARKER = "__skvExternalPlan";
const MAX_SEEN_MESSAGES = 200;
const TAB_URL = "sync/saalplan_extern.html";
const ROYAL_BLUE = "#4169E1";

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
            console.warn("[SYNC-EXTERNAL] BroadcastChannel konnte Nachricht nicht senden:", err);
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
            console.warn("[SYNC-EXTERNAL] localStorage-Fallback konnte Nachricht nicht senden:", err);
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
                    console.warn("[SYNC-EXTERNAL] BroadcastChannel konnte nicht geschlossen werden:", err);
                }
            }, { once: true });
        } catch (err) {
            console.warn("[SYNC-EXTERNAL] BroadcastChannel konnte nicht initialisiert werden:", err);
            channel = null;
        }
    }
    return channel;
}

function handleIncomingPayload(payload) {
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "request_state") {
        broadcastExternalPlanState("request-response");
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
        console.warn("[SYNC-EXTERNAL] Konnte Nachricht aus localStorage nicht verarbeiten:", err);
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

function buildSeatSegments(list, totalSeats, tableNr) {
    const segments = [];

    if (Array.isArray(list)) {
        for (const entry of list) {
            const count = Math.max(parseInt(entry?.cards, 10) || 0, 0);
            if (!count) continue;

            const splitInfo = buildSplitInfoText(entry?.bookingId, tableNr);

            const segment = {
                type: "reserved",
                count,
                bookingId: entry?.bookingId ?? null,
                name: entry?.name ?? "",
                notes: entry?.notes ?? "",
                sold: false,
                colorPrimary: ROYAL_BLUE,
            };

            if (splitInfo) {
                segment.splitInfo = splitInfo;
            }

            segments.push(segment);
        }
    }

    const reservedSeats = segments.reduce((sum, seg) => sum + Math.max(parseInt(seg?.count, 10) || 0, 0), 0);
    const freeSeats = Math.max(totalSeats - reservedSeats, 0);
    if (freeSeats > 0) {
        segments.push({ type: "free", count: freeSeats });
    }

    return segments;
}

function buildTablePayload() {
    return tisch.map(([nr, freeSeats, position, gangDaneben]) => {
        const bucket = reservationsByTable[nr] || [];
        const cartEntries = bucket.filter(entry => !!entry?.inCart);
        const reservedInCart = sumCards(cartEntries);
        const totalReserved = sumCards(bucket);
        const free = Math.max(parseInt(freeSeats, 10) || 0, 0);
        const total = Math.max(free + totalReserved, 0);

        return {
            nr,
            free: Math.max(total - reservedInCart, 0),
            reserved: reservedInCart,
            sold: 0,
            total,
            position: nr === 0 ? "standing" : (position || "middle"),
            gangDaneben: gangDaneben || null,
            segments: buildSeatSegments(cartEntries, total, nr),
        };
    }).sort((a, b) => a.nr - b.nr);
}

function buildCartSummary() {
    const entries = getCartEntries();
    const price = getCardPriceValue();
    const linesMap = new Map();

    for (const { tableNr, reservation } of entries) {
        const cards = Number.isFinite(reservation?.cards)
            ? reservation.cards
            : parseInt(reservation?.cards, 10) || 0;
        if (!cards) continue;

        const label = tableLabel(tableNr);
        const key = String(tableNr);
        const amount = cards * price;

        if (!linesMap.has(key)) {
            linesMap.set(key, {
                tableNr,
                label,
                quantity: 0,
                amount: 0,
            });
        }

        const line = linesMap.get(key);
        line.quantity += cards;
        line.amount += amount;
    }

    const lines = Array.from(linesMap.values());
    lines.sort((a, b) => {
        const aNr = a.tableNr === 0 ? Number.POSITIVE_INFINITY : a.tableNr;
        const bNr = b.tableNr === 0 ? Number.POSITIVE_INFINITY : b.tableNr;
        if (aNr === bNr) return 0;
        return aNr - bNr;
    });
    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
    const totalCards = lines.reduce((sum, line) => sum + line.quantity, 0);

    return {
        lines,
        totalAmount,
        totalCards,
        currency: "EUR",
        unitPrice: price,
    };
}

function createPayload(reason) {
    const payload = {
        reason,
        generatedAt: Date.now(),
        tables: buildTablePayload(),
        cart: buildCartSummary(),
    };
    return payload;
}

export function broadcastExternalPlanState(reason = "update") {
    ensureChannel();
    const payload = createPayload(reason);
    const signature = JSON.stringify({
        tables: payload.tables,
        cart: payload.cart,
    });
    if (signature === lastSignature && reason !== "request-response") {
        return;
    }
    lastSignature = signature;
    lastPayload = payload;
    const envelope = createEnvelope({ type: "state", payload });
    transmitEnvelope(envelope);
}

export function setupExternalPlanSync() {
    ensureChannel();
    if (lastPayload === null) {
        broadcastExternalPlanState("init");
    }
    onCartChange(() => broadcastExternalPlanState("cart-change"));
    onCardPriceChange(() => broadcastExternalPlanState("price-change"));
}

export function openExternalPlanTab() {
    const win = window.open(TAB_URL, "skv-external-plan");
    if (win && typeof win === "object") {
        try {
            win.opener = null;
        } catch (err) { /* ignore */ }
    }
    broadcastExternalPlanState("open-tab");
    return win;
}

export function getExternalPlanChannelName() {
    return CHANNEL_NAME;
}