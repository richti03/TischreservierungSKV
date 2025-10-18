import { tisch, reservationsByTable } from "../core/state.js";

const CHANNEL_NAME = "skv-internal-plan";
const TAB_URL = "sync/saalplan_intern.html";

const COLOR_PALETTE = [
    { primary: "#FF6F61", secondary: "#FFB199" },
    { primary: "#42A5F5", secondary: "#90CAF9" },
    { primary: "#66BB6A", secondary: "#A5D6A7" },
    { primary: "#AB47BC", secondary: "#CE93D8" },
    { primary: "#FFA726", secondary: "#FFCC80" },
    { primary: "#26C6DA", secondary: "#80DEEA" },
    { primary: "#EC407A", secondary: "#F48FB1" },
    { primary: "#7E57C2", secondary: "#B39DDB" },
];

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

function buildSeatSegments(list, freeSeats) {
    const segments = [];
    let paletteIndex = 0;

    if (Array.isArray(list)) {
        for (const entry of list) {
            const count = Math.max(parseInt(entry?.cards, 10) || 0, 0);
            if (!count) continue;

            const segment = {
                type: entry?.sold ? "sold" : "reserved",
                count,
                bookingId: entry?.bookingId ?? null,
                name: entry?.name ?? "",
                notes: entry?.notes ?? "",
                sold: !!entry?.sold,
            };

            if (!segment.sold) {
                const palette = COLOR_PALETTE[paletteIndex % COLOR_PALETTE.length];
                paletteIndex += 1;
                segment.colorPrimary = palette.primary;
                segment.colorSecondary = palette.secondary;
            }

            segments.push(segment);
        }
    }

    const free = Math.max(parseInt(freeSeats, 10) || 0, 0);
    if (free > 0) {
        segments.push({ type: "free", count: free });
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
            segments: buildSeatSegments(list, free),
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