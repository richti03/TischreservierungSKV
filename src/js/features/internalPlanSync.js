import { tisch, reservationsByTable } from "../core/state.js";

const CHANNEL_NAME = "skv-internal-plan";
const TAB_URL = "sync/saalplan_intern.html";

let channel = null;
let lastSignature = null;
let lastPayload = null;

function ensureChannel() {
    if (typeof BroadcastChannel === "undefined") {
        console.warn("[SYNC] BroadcastChannel wird vom Browser nicht unterstützt.");
        return null;
    }
    if (!channel) {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.addEventListener("message", onChannelMessage);
        window.addEventListener("beforeunload", () => {
            try {
                channel?.close();
            } catch (err) {
                console.warn("[SYNC] BroadcastChannel konnte nicht geschlossen werden:", err);
            }
        }, { once: true });
    }
    return channel;
}

function onChannelMessage(event) {
    const data = event?.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "request_state") {
        broadcastInternalPlanState("request-response");
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

function buildTablePayload() {
    return tisch.map(([nr, freeSeats, position, gangDaneben]) => {
        const list = reservationsByTable[nr] || [];
        const reserved = sumCards(list);
        const sold = sumCards(list, r => !!r?.sold);
        const total = Math.max((Number(freeSeats) || 0) + reserved, 0);
        return {
            nr,
            free: Math.max(parseInt(freeSeats, 10) || 0, 0),
            reserved,
            sold,
            total,
            position: nr === 0 ? "standing" : (position || "middle"),
            gangDaneben: gangDaneben || null,
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
    const bc = ensureChannel();
    if (!bc) return;
    const payload = createPayload(reason);
    const signature = JSON.stringify(payload.tables);
    if (signature === lastSignature && reason !== "request-response") {
        return;
    }
    lastSignature = signature;
    lastPayload = payload;
    try {
        bc.postMessage({ type: "state", payload });
    } catch (err) {
        console.error("[SYNC] BroadcastChannel-Übertragung fehlgeschlagen:", err);
    }
}

export function setupInternalPlanSync() {
    const bc = ensureChannel();
    if (!bc) return;
    if (lastPayload === null) {
        broadcastInternalPlanState("init");
    }
}

export function openInternalPlanTab() {
    const win = window.open(TAB_URL, "skv-internal-plan");
    if (win && typeof win === "object") {
        try { win.opener = null; } catch (err) { /* ignore */ }
    }
    broadcastInternalPlanState("open-tab");
    return win;
}

export function getInternalPlanChannelName() {
    return CHANNEL_NAME;
}