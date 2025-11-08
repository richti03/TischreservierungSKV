import {
    tisch,
    reservationsByTable,
    sortTischArrayNr,
    downloadJSON,
    pickJSONFile,
    fileTimestamp,
    setLastReservationsFilename,
    nextBookingId,
    bumpBookingSeqFromExisting,
    getCardPriceValue,
    setCardPriceValue,
    getExternalEventName,
    markEventStateDirty,
} from "../core/state.js";
import {
    getActiveEventFileSafeName,
    getActiveEvent,
    renameEvent,
    parseReservationsFilename,
    setEventDisplayName,
} from "../core/events.js";
import { printTischArray, updateFooter, renderReservationsForSelectedTable } from "../ui/tableView.js";

/* Hilfen */
function sumCardsByTable(resMap) {
    const sums = {};
    for (const key of Object.keys(resMap)) {
        const nr = parseInt(key, 10);
        if (!Number.isInteger(nr)) continue;
        const arr = resMap[key] || [];
        sums[nr] = arr.reduce((s, r) => s + (parseInt(r.cards) || 0), 0);
    }
    return sums;
}
function getFreeSeatsMap() {
    const map = {};
    for (const [nr, free] of tisch) map[nr] = free;
    return map;
}
function setFreeSeatsFromMap(newFreeMap) {
    // alle Tische aus der Vereinigungsmenge setzen/ergänzen
    const allTables = new Set([
        ...tisch.map(([nr]) => nr),
        ...Object.keys(newFreeMap).map(x => parseInt(x, 10))
    ]);
    for (const nr of allTables) {
        const free = Math.max(parseInt(newFreeMap[nr] ?? 0), 0);
        const idx = tisch.findIndex(([n]) => n === nr);
        if (idx >= 0) tisch[idx][1] = free;
        else {
            const defaultPosition = nr === 0 ? "standing" : "middle";
            tisch.push([nr, free, defaultPosition, null]);
        }
    }
    sortTischArrayNr(tisch);
}

/* SEATS Export/Import */
function buildFilename(prefix, fallbackBuilder) {
    const base = getActiveEventFileSafeName();
    if (base) {
        return `${base}-${prefix}.json`;
    }
    return fallbackBuilder();
}

export function exportSeatsJSON() {
    sortTischArrayNr(tisch);
    const data = {
        version: 1,
        type: "seats",
        exportedAt: new Date().toISOString(),
        seats: tisch.map(([table, seats]) => ({ table, seats }))
    };
    const filename = buildFilename("sitze", () => `sitze_${fileTimestamp()}.json`);
    downloadJSON(data, filename);
}

export function importSeatsJSON() {
    pickJSONFile(obj => {
        let entries = [];
        if (Array.isArray(obj)) entries = obj;
        else if (obj && Array.isArray(obj.seats)) entries = obj.seats;
        else if (obj && typeof obj === "object") {
            for (const k of Object.keys(obj)) {
                if (/^\d+$/.test(k)) entries.push({ table: parseInt(k, 10), seats: obj[k] });
            }
        }
        if (entries.length === 0) {
            alert("Keine Sitzplatzdaten gefunden.");
            return;
        }
        for (const e of entries) {
            const nr = parseInt(e.table), seats = parseInt(e.seats);
            if (!Number.isInteger(nr) || !Number.isInteger(seats)) continue;
            const idx = tisch.findIndex(([n]) => n === nr);
            if (idx >= 0) tisch[idx][1] = seats;
            else {
                const defaultPosition = nr === 0 ? "standing" : "middle";
                tisch.push([nr, seats, defaultPosition, null]);
            }
        }
        sortTischArrayNr(tisch);
        printTischArray(tisch);
        updateFooter();
        renderReservationsForSelectedTable();
        markEventStateDirty("seats-import");
        console.log("[IMPORT] Sitzplätze importiert:", entries);
    });
}

/* RESERVATIONS Export/Import – mit korrekter Neuberechnung der freien Plätze + Dateiname + SOLD-Flag */
export function exportReservationsJSON() {
    const activeEvent = getActiveEvent();
    const canonical = parseReservationsFilename(`${activeEvent?.name ?? ""}.json`);
    if (!canonical) {
        alert("Bitte vergeben Sie einen gültigen Veranstaltungsnamen (JJJJ-MM-TT-Art), bevor Sie Reservierungen exportieren.");
        return;
    }

    const displayName = getExternalEventName() || activeEvent?.state?.externalEventName || activeEvent?.name || "";
    const price = getCardPriceValue();
    const data = {
        version: 1,
        type: "reservations",
        exportedAt: new Date().toISOString(),
        eventName: activeEvent?.name ?? null,
        eventDisplayName: displayName || null,
        cardPriceValue: Number.isFinite(price) ? price : null,
        // reservationsByTable enthält nun auch das Feld `sold` in den Einträgen
        reservationsByTable
    };

    downloadJSON(data, canonical.filename);
    setLastReservationsFilename(canonical.filename);
}

function processReservationsImport(obj, filename) {
    const meta = parseReservationsFilename(filename || "");
    if (!meta) {
        alert("ungültige Datei");
        return false;
    }

    const src = obj && (obj.reservationsByTable || obj);
    if (!src || typeof src !== "object") {
        alert("Ungültiges Format für Reservierungen.");
        return false;
    }

    const activeEvent = getActiveEvent();
    if (activeEvent && activeEvent.id) {
        renameEvent(activeEvent.id, meta.eventName);
        const importedDisplayName = typeof obj?.eventDisplayName === "string"
            ? obj.eventDisplayName.trim()
            : "";
        const finalDisplayName = importedDisplayName || meta.eventName;
        setEventDisplayName(activeEvent.id, finalDisplayName);
    }

    const rawPrice = obj?.cardPriceValue ?? obj?.cardPrice;
    let parsedPrice = Number.isFinite(rawPrice) ? Number(rawPrice) : NaN;
    if (!Number.isFinite(parsedPrice) && typeof rawPrice === "string") {
        const normalized = rawPrice.replace(/€/g, "").replace(/,/g, ".").trim();
        parsedPrice = Number.parseFloat(normalized);
    }
    if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
        setCardPriceValue(parsedPrice);
    }

    // 1) Bestehende Kapazität je Tisch ermitteln:
    //    capacity = currentFree + sum(existingReservations)
    const currentFree = getFreeSeatsMap();
    const oldSums = sumCardsByTable(reservationsByTable);
    const capacity = {};
    const allOldTables = new Set([
        ...Object.keys(currentFree).map(n => parseInt(n, 10)),
        ...Object.keys(oldSums).map(n => parseInt(n, 10))
    ]);
    for (const nr of allOldTables) {
        const free = parseInt(currentFree[nr] ?? 0) || 0;
        const occ  = parseInt(oldSums[nr] ?? 0) || 0;
        capacity[nr] = free + occ;
    }

    // 2) Neue Reservierungen normalisieren (bookingId beibehalten oder fortlaufend vergeben; SOLD-Flag übernehmen)
    const next = {};
    for (const key of Object.keys(src)) {
        const nr = parseInt(key, 10);
        if (!Number.isInteger(nr)) continue;
        const arr = src[key];
        if (!Array.isArray(arr)) continue;
        next[nr] = arr.map(r => ({
            id: r.id || (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
            bookingId: r.bookingId ? String(r.bookingId) : nextBookingId(),
            name: String(r.name || "").trim(),
            cards: parseInt(r.cards) || 0,
            notes: typeof r.notes === "string" ? r.notes : "",
            ts: r.ts || new Date().toISOString(),
            sold: !!r.sold, // <— SOLD-Flag
        })).filter(r => r.name && r.cards > 0);
    }

    // 3) Import anwenden (in-place ersetzen)
    for (const k of Object.keys(reservationsByTable)) delete reservationsByTable[k];
    for (const k of Object.keys(next)) reservationsByTable[k] = next[k];

    // 3b) Sequenz anpassen an höchste vorhandene bookingId
    bumpBookingSeqFromExisting(reservationsByTable);

    // 4) Neue Belegungssummen und daraus neue freie Plätze berechnen
    const newSums = sumCardsByTable(reservationsByTable);
    const allTables = new Set([
        ...Object.keys(capacity).map(n => parseInt(n, 10)),
        ...Object.keys(newSums).map(n => parseInt(n, 10))
    ]);

    const newFree = {};
    for (const nr of allTables) {
        const cap = parseInt(capacity[nr] ?? 0) || 0;
        const occ = parseInt(newSums[nr] ?? 0) || 0;
        // Wenn der Tisch bisher gar nicht existierte (keine Kapazität bekannt),
        // setzen wir Kapazität = Belegung ⇒ freie Plätze = 0.
        const effCap = (cap > 0) ? cap : occ;
        newFree[nr] = Math.max(effCap - occ, 0);
    }

    setFreeSeatsFromMap(newFree);

    // 5) Dateinamen merken, UI aktualisieren
    setLastReservationsFilename(meta.filename);

    printTischArray(tisch);
    updateFooter();
    renderReservationsForSelectedTable();

    console.log("[IMPORT] Reservierungen importiert. Quelle:", meta.filename);
    console.log("[IMPORT] Kapazität je Tisch (errechnet):", capacity);
    console.log("[IMPORT] Neue Belegungssummen:", newSums);
    console.log("[IMPORT] Neue freie Plätze:", newFree);
    markEventStateDirty("reservations-import");
    return true;
}

export function importReservationsJSON(options = {}) {
    const { presetData, presetFilename } = options || {};

    const runImport = (obj, filename) => processReservationsImport(obj, filename);

    if (presetData && presetFilename) {
        return runImport(presetData, presetFilename);
    }

    pickJSONFile((obj, filename) => {
        runImport(obj, filename);
    });

    return null;
}
