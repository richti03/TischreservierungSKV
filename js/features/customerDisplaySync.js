import { getCartEntries, onCartChange } from "./cart.js";
import { buildCartSummary, getLatestInvoice, onInvoicesChange, getPaymentLabel } from "./invoices.js";

const CHANNEL_NAME = "skv-customer-display";
const STORAGE_KEY = "skv-customer-display-message";
const MESSAGE_MARKER = "__skvCustomerDisplay";
const MAX_SEEN_MESSAGES = 200;
const TAB_URL = "sync/kundendisplay.html";

let channel = null;
let storageListenerBound = false;
let lastSignature = null;
let visibleInvoiceId = null;
const seenMessageIds = new Set();
const seenQueue = [];

function rememberMessage(id) {
    if (!id || seenMessageIds.has(id)) return;
    seenMessageIds.add(id);
    seenQueue.push(id);
    if (seenQueue.length > MAX_SEEN_MESSAGES) {
        const oldest = seenQueue.shift();
        if (oldest) seenMessageIds.delete(oldest);
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
            console.warn("[CUSTOMER-DISPLAY] Broadcast konnte Nachricht nicht senden:", err);
        }
    }

    if (!envelope) return;
    if (typeof localStorage === "undefined" || localStorage === null) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (err) {
        if (err?.name !== "SecurityError") {
            console.warn("[CUSTOMER-DISPLAY] localStorage konnte Nachricht nicht speichern:", err);
        }
    }
}

function setupStorageListener() {
    if (storageListenerBound) return;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
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
                    console.warn("[CUSTOMER-DISPLAY] BroadcastChannel konnte nicht geschlossen werden:", err);
                }
            }, { once: true });
        } catch (err) {
            console.warn("[CUSTOMER-DISPLAY] BroadcastChannel konnte nicht initialisiert werden:", err);
            channel = null;
        }
    }
    return channel;
}

function handleIncomingEnvelope(envelope) {
    if (!envelope || envelope.marker !== MESSAGE_MARKER) return;
    if (hasSeenMessage(envelope.id)) return;
    rememberMessage(envelope.id);
}

function onChannelMessage(event) {
    handleIncomingEnvelope(event?.data);
}

function onStorageMessage(event) {
    if (!event || event.key !== STORAGE_KEY) return;
    if (!event.newValue) return;
    try {
        const parsed = JSON.parse(event.newValue);
        handleIncomingEnvelope(parsed);
    } catch (err) {
        console.warn("[CUSTOMER-DISPLAY] Konnte Nachricht aus localStorage nicht lesen:", err);
    }
}

function buildModePayload() {
    const entries = getCartEntries();
    const hasCartItems = entries.length > 0;
    const latestInvoice = getLatestInvoice();
    if (visibleInvoiceId && latestInvoice?.id !== visibleInvoiceId) {
        visibleInvoiceId = null;
    }
    let mode = "welcome";
    let cart = null;
    let invoice = null;

    if (visibleInvoiceId && latestInvoice?.id === visibleInvoiceId) {
        mode = "invoice";
        invoice = {
            id: latestInvoice.id,
            invoiceNumber: latestInvoice.invoiceNumber,
            createdAt: latestInvoice.createdAt,
            paymentMethod: latestInvoice.paymentMethod,
            paymentLabel: getPaymentLabel(latestInvoice.paymentMethod),
            totalAmount: latestInvoice.totalAmount,
            totalCards: latestInvoice.totalCards,
            currency: latestInvoice.currency,
            lines: latestInvoice.lines.map(line => ({
                id: line.id,
                name: line.name,
                detail: line.detail,
                quantity: line.quantity,
                unitPriceFormatted: line.unitPriceFormatted,
                totalFormatted: line.totalFormatted,
            })),
            dataUrl: latestInvoice.dataUrl,
            fileName: latestInvoice.fileName,
            shareUrl: latestInvoice.shareUrl,
            shareToken: latestInvoice.shareToken,
        };
    } else if (hasCartItems) {
        mode = "cart";
        const summary = buildCartSummary(entries);
        cart = {
            lines: summary.lines,
            totalAmount: summary.totalAmount,
            totalCards: summary.totalCards,
            currency: summary.currency,
        };
    }

    return {
        generatedAt: Date.now(),
        mode,
        cart,
        invoice,
    };
}

function broadcastCustomerDisplayState(reason = "update") {
    ensureChannel();
    const payload = buildModePayload();
    const signature = JSON.stringify({ mode: payload.mode, cart: payload.cart, invoice: payload.invoice?.id || null, lines: payload.cart?.lines?.length || payload.invoice?.lines?.length || 0, total: payload.cart?.totalAmount || payload.invoice?.totalAmount || 0 });
    if (signature === lastSignature && reason !== "forced") {
        return;
    }
    lastSignature = signature;
    const envelope = createEnvelope({ type: "state", payload });
    transmitEnvelope(envelope);
}

export function setupCustomerDisplaySync() {
    ensureChannel();
    broadcastCustomerDisplayState("init");
    onCartChange(() => {
        if (!visibleInvoiceId) {
            broadcastCustomerDisplayState("cart-change");
        } else {
            // Cart was cleared after invoice? keep invoice visible
            broadcastCustomerDisplayState("invoice-hold");
        }
    });
    onInvoicesChange(event => {
        if (event?.invoice?.id) {
            visibleInvoiceId = event.invoice.id;
        }
        broadcastCustomerDisplayState("invoice-change");
    });
}

export function openCustomerDisplayTab() {
    const win = window.open(TAB_URL, "skv-customer-display");
    if (win && typeof win === "object") {
        try {
            win.opener = null;
        } catch (err) { /* ignore */ }
    }
    broadcastCustomerDisplayState("open-tab");
    return win;
}

export function signalNextCustomer() {
    visibleInvoiceId = null;
    broadcastCustomerDisplayState("forced");
}

export function isInvoiceVisible() {
    return Boolean(visibleInvoiceId);
}
