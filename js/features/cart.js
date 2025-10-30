import {
    reservationsByTable,
    ensureBucket,
    getCardPriceValue,
} from "../core/state.js";

const cartListeners = new Set();

function notifyCartChange() {
    const entries = getCartEntries();
    for (const cb of cartListeners) {
        try {
            cb(entries);
        } catch (err) {
            console.error("[CART] Listener error", err);
        }
    }
}

export function onCartChange(cb) {
    if (typeof cb !== "function") return () => {};
    cartListeners.add(cb);
    return () => cartListeners.delete(cb);
}

export function getCartEntries() {
    const items = [];
    for (const key of Object.keys(reservationsByTable)) {
        const tableNr = parseInt(key, 10);
        if (!Number.isInteger(tableNr)) continue;
        ensureBucket(tableNr);
        const list = reservationsByTable[tableNr] || [];
        list.forEach((reservation, index) => {
            if (!reservation) return;
            if (reservation.sold && reservation.inCart) {
                reservation.inCart = false;
                return;
            }
            if (reservation.inCart) {
                items.push({ tableNr, reservation, index });
            }
        });
    }
    return items;
}

function findReservation(tableNr, reservationId) {
    ensureBucket(tableNr);
    const list = reservationsByTable[tableNr] || [];
    const idx = list.findIndex(r => r.id === reservationId);
    if (idx < 0) return null;
    return { reservation: list[idx], list, index: idx };
}

export function addToCart(tableNr, reservationId) {
    const found = findReservation(tableNr, reservationId);
    if (!found) return false;
    const { reservation } = found;
    if (reservation.sold) {
        reservation.inCart = false;
        return false;
    }
    reservation.inCart = true;
    notifyCartChange();
    return true;
}

export function removeFromCart(tableNr, reservationId) {
    const found = findReservation(tableNr, reservationId);
    if (!found) return false;
    found.reservation.inCart = false;
    notifyCartChange();
    return true;
}

export function markCartDirty() {
    notifyCartChange();
}

export function markCartAsSold() {
    const entries = getCartEntries();
    if (entries.length === 0) {
        return { sold: 0, totalCards: 0 };
    }
    let totalCards = 0;
    for (const { reservation } of entries) {
        reservation.sold = true;
        reservation.inCart = false;
        const cards = Number.isFinite(reservation.cards)
            ? reservation.cards
            : parseInt(reservation.cards, 10) || 0;
        totalCards += cards;
    }
    notifyCartChange();
    return { sold: entries.length, totalCards };
}

export function calculateCartTotal() {
    const price = getCardPriceValue();
    return getCartEntries().reduce((sum, { reservation }) => {
        const cards = typeof reservation.cards === "number"
            ? reservation.cards
            : parseInt(reservation.cards, 10) || 0;
        return sum + cards * price;
    }, 0);
}