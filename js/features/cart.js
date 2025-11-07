import { getEventsWithState, getEventMetaById, getActiveEvent, onEventsChange } from "../core/events.js";

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

onEventsChange(() => {
    notifyCartChange();
});

export function onCartChange(cb) {
    if (typeof cb !== "function") return () => {};
    cartListeners.add(cb);
    return () => cartListeners.delete(cb);
}

function resolveEventMeta(eventId = null) {
    if (eventId) {
        return getEventMetaById(eventId);
    }
    const active = getActiveEvent();
    if (active && active.id) {
        return getEventMetaById(active.id);
    }
    const [first] = getEventsWithState();
    return first || null;
}

export function getCartEntries() {
    const items = [];
    const events = getEventsWithState();

    for (const event of events) {
        const reservationsMap = event?.state?.reservationsByTable || {};
        const cardPrice = Number.isFinite(event?.state?.cardPriceValue)
            ? event.state.cardPriceValue
            : 0;

        const tableNumbers = Object.keys(reservationsMap)
            .map(key => parseInt(key, 10))
            .filter(Number.isInteger)
            .sort((a, b) => a - b);

        for (const tableNr of tableNumbers) {
            const list = reservationsMap[tableNr] || [];
            list.forEach((reservation, index) => {
                if (!reservation) return;
                if (reservation.sold && reservation.inCart) {
                    reservation.inCart = false;
                    return;
                }
                if (reservation.inCart) {
                    items.push({
                        eventId: event.id,
                        eventName: event.name,
                        eventDisplayName: event.displayName,
                        tableNr,
                        reservation,
                        index,
                        cardPrice,
                        eventState: event.state,
                    });
                }
            });
        }
    }

    return items;
}

function findReservation(tableNr, reservationId, eventId = null) {
    const event = resolveEventMeta(eventId);
    if (!event || !event.state) {
        return null;
    }

    const numericTableNr = Number.parseInt(tableNr, 10);
    if (!Number.isInteger(numericTableNr)) {
        return null;
    }

    const reservationsMap = event.state.reservationsByTable || {};
    const list = reservationsMap[numericTableNr] || [];
    const index = list.findIndex(r => r?.id === reservationId);
    if (index < 0) {
        return null;
    }

    return { reservation: list[index], list, index, event, tableNr: numericTableNr };
}

export function addToCart(tableNr, reservationId, eventId = null) {
    const found = findReservation(tableNr, reservationId, eventId);
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

export function removeFromCart(tableNr, reservationId, eventId = null) {
    const found = findReservation(tableNr, reservationId, eventId);
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
        const cards = Number.isFinite(reservation?.cards)
            ? reservation.cards
            : parseInt(reservation?.cards, 10) || 0;
        totalCards += cards;
    }
    notifyCartChange();
    return { sold: entries.length, totalCards };
}

export function calculateCartTotal() {
    return getCartEntries().reduce((sum, { reservation, cardPrice }) => {
        const cards = typeof reservation?.cards === "number"
            ? reservation.cards
            : parseInt(reservation?.cards, 10) || 0;
        const price = Number.isFinite(cardPrice) ? cardPrice : 0;
        return sum + cards * price;
    }, 0);
}
