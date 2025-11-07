// Globales Buchungs-Suchmodal (Name/BookingID) mit Aktionen – Icon-Buttons + Tooltips
// Notizen zeigen jetzt auch Split-Info ("Weitere Plätze ...")

import {
    reservationsByTable, ensureBucket, escapeHtml, noteToHtml,
    getSeatsByTableNumber, setSeatsByTableNumber, buildSplitInfoText,
    tableLabel,
} from "../core/state.js";
import { printTischArray, renderReservationsForSelectedTable, setSelectedTableNr } from "../ui/tableView.js";
import { openMoveModal } from "./modalMoveSwap.js";
import { addToCart, removeFromCart, markCartDirty } from "./cart.js";
import { getEventsWithState, getActiveEvent, setActiveEvent, onEventsChange } from "../core/events.js";

let wired = false;
let unsubscribeEvents = null;
let lastEventFilterId = "";

function ensureEventActive(eventId) {
    if (!eventId) {
        return true;
    }
    const active = getActiveEvent();
    if (active?.id === eventId) {
        return true;
    }
    const success = setActiveEvent(eventId);
    if (!success) {
        console.warn("[SEARCH MODAL] Veranstaltung konnte nicht aktiviert werden:", eventId);
    }
    return success;
}

function updateEventFilterOptions(select) {
    if (!select) return;
    const events = getEventsWithState();
    const previous = select.value || lastEventFilterId || "";
    const options = ['<option value="">Alle Veranstaltungen</option>'];
    events.forEach(event => {
        if (!event?.id) return;
        const label = escapeHtml(event.displayName || event.name || "Veranstaltung");
        options.push(`<option value="${event.id}">${label}</option>`);
    });
    select.innerHTML = options.join("");
    const match = events.some(event => event?.id === previous);
    if (match) {
        select.value = previous;
        lastEventFilterId = previous;
    } else {
        select.value = "";
        lastEventFilterId = "";
    }
}

function ensureSearchModal() {
    let el = document.getElementById("bookingSearchModal");
    if (el) return el;

    const wrap = document.createElement("div");
    wrap.innerHTML = `
  <div id="bookingSearchModal" class="modal hidden modal--xl" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="bookingSearchTitle">
    <div class="modal__backdrop"></div>
    <div class="modal__dialog">
      <header class="modal__header">
        <h3 id="bookingSearchTitle">Buchungen suchen</h3>
        <button type="button" class="modal__close" id="bk-search-close" aria-label="Schließen">×</button>
      </header>
      <div class="modal__body">
        <div class="bk-search-bar" style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
          <input id="bk-search-input" type="search" placeholder="Suche nach Name oder Booking-ID (z. B. 'Müller' oder '007')" style="flex:1 1 240px; padding:10px 12px; font-size:14px; min-width:220px;">
          <select id="bk-search-event" style="flex:0 0 auto; min-width:220px; padding:10px 12px; font-size:14px;">
            <option value="">Alle Veranstaltungen</option>
          </select>
          <button id="bk-search-clear" class="btn btn--ghost" type="button" title="Suche leeren" aria-label="Suche leeren">Leeren</button>
        </div>
        <div class="table-wrap">
          <table class="table table--compact" id="bk-search-table" style="width:100%;">
            <thead>
              <tr>
                <th style="min-width:180px; text-align:left;">Veranstaltung</th>
                <th style="min-width:160px; text-align:left;">Name (+ Booking-ID)</th>
                <th style="width:110px;">Tisch</th>
                <th style="width:90px;">Plätze</th>
                <th>Notizen</th>
                <th style="width:320px;">Aktionen</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      <footer class="modal__footer">
        <div style="margin-left:auto;">
          <button class="btn btn--ghost" id="bk-search-cancel" type="button" title="Schließen" aria-label="Schließen">Schließen</button>
        </div>
      </footer>
    </div>
  </div>`;
    document.body.appendChild(wrap.firstElementChild);
    return document.getElementById("bookingSearchModal");
}

/* -------- Icons & Icon-Buttons ---------- */
function icon(name) {
    const common = 'class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    switch (name) {
        case "edit":   return `<svg ${common}><path d="M12 20h9"/><path d="M16.5 3.5A2.121 2.121 0 1 1 19.5 6.5L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
        case "move":        return `<svg ${common}><polyline points="5 12 9 8 5 4"/><line x1="9" y1="8" x2="15" y2="8"/><polyline points="19 12 15 16 19 20"/><line x1="15" y1="16" x2="9" y2="16"/></svg>`;
        case "cart":        return `<svg ${common}><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61H19a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
        case "cart-remove": return `<svg ${common}><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61H19a2 2 0 0 0 2-1.61L23 6H6"/><line x1="4" y1="4" x2="22" y2="22"/></svg>`;
        case "unsold":     return `<svg ${common}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`; // rotate-ccw (Undo)
        case "trash":  return `<svg ${common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
        default:       return "";
    }
}
function iconBtn({ action, title, ghost=false }) {
    const extra = action === "cart-remove" ? "icon-btn--cart" : "";
    const cls = `btn icon-btn ${ghost ? "btn--ghost" : ""} ${extra}`.trim();
    const aria = title.replace(/"/g, "'");
    const svg = (
        action === "edit"   ? icon("edit")   :
            action === "move"   ? icon("move")   :
                action === "cart"   ? icon("cart")   :
                    action === "cart-remove" ? icon("cart-remove") :
                        action === "unsold" ? icon("unsold") :
                            action === "delete" ? icon("trash")  : ""
    );
    return `<button class="${cls}" data-action="${action}" title="${aria}" aria-label="${aria}">${svg}</button>`;
}
/* ---------------------------------------- */

// Datensatz für die Tabelle vorbereiten (flatten)
function collectRows(eventFilterId = "") {
    const rows = [];
    const events = getEventsWithState();
    events.forEach(event => {
        if (!event?.id) return;
        if (eventFilterId && event.id !== eventFilterId) return;
        const reservationsMap = event?.state?.reservationsByTable || {};
        const tableNumbers = Object.keys(reservationsMap)
            .map(key => parseInt(key, 10))
            .filter(Number.isInteger)
            .sort((a, b) => a - b);
        tableNumbers.forEach(tableNr => {
            const list = reservationsMap[tableNr] || [];
            list.forEach(reservation => {
                if (!reservation) return;
                rows.push({
                    id: reservation.id,
                    bookingId: String(reservation.bookingId ?? ""),
                    name: String(reservation.name ?? ""),
                    cards: parseInt(reservation.cards, 10) || 0,
                    notes: reservation.notes || "",
                    sold: !!reservation.sold,
                    inCart: !!reservation.inCart,
                    tableNr,
                    eventId: event.id,
                    eventName: event.name || "",
                    eventDisplayName: event.displayName || event.name || "",
                    sourceReservations: reservationsMap,
                });
            });
        });
    });
    rows.sort((a, b) => {
        const nameA = a.eventDisplayName || a.eventName || "";
        const nameB = b.eventDisplayName || b.eventName || "";
        const eventCmp = nameA.localeCompare(nameB, "de", { sensitivity: "base" });
        if (eventCmp !== 0) return eventCmp;
        if (a.tableNr !== b.tableNr) return a.tableNr - b.tableNr;
        return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
    });
    return rows;
}

// Rendering der Tabelle (mit optionalem Filter)
function renderTable(filter = "", eventFilterId = "") {
    const modal = document.getElementById("bookingSearchModal");
    if (!modal) return;
    const tbody = modal.querySelector("#bk-search-table tbody");
    if (!tbody) return;

    const q = (filter || "").trim().toLowerCase();
    const rows = collectRows(eventFilterId).filter(r => {
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || String(r.bookingId).toLowerCase().includes(q);
    });

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; opacity:.7;">Keine passenden Buchungen gefunden.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const bid = r.bookingId || "—";
        const baseNotes = noteToHtml(r.notes);
        const splitInfo = buildSplitInfoText(r.bookingId, r.tableNr, r.sourceReservations);
        const splitHtml = splitInfo ? `<div style="font-size:12px;opacity:.75;">${escapeHtml(splitInfo)}</div>` : "";
        const notesHtml = baseNotes + splitHtml;

        const rowClasses = [];
        if (r.sold) rowClasses.push("is-sold");
        if (r.inCart && !r.sold) rowClasses.push("is-in-cart");
        const classAttr = rowClasses.length ? ` class="${rowClasses.join(" ")}"` : "";

        const eventName = r.eventDisplayName || r.eventName || "—";
        const tableText = tableLabel(r.tableNr);

        const actions = r.sold
            ? iconBtn({ action:"unsold", title:"Verkauf rückgängig" })
            : [
                iconBtn({ action:"edit",   title:"Bearbeiten" }),
                iconBtn({ action:"move",   title:"Verschieben" }),
                iconBtn({ action: r.inCart ? "cart-remove" : "cart", title: r.inCart ? "Aus Warenkorb entfernen" : "Zum Warenkorb hinzufügen" }),
                iconBtn({ action:"delete", title:"Löschen", ghost:true })
            ].join(" ");

        return `
      <tr data-id="${r.id}" data-table="${r.tableNr}" data-event="${r.eventId ?? ""}"${classAttr}>
        <td>${escapeHtml(eventName)}</td>
        <td>
          ${escapeHtml(r.name)}
          <div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div>
        </td>
        <td>${escapeHtml(tableText)}</td>
        <td>${r.cards}</td>
        <td>${notesHtml}</td>
        <td class="actions" style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</td>
      </tr>`;
    }).join("");
}

function closeModal() {
    const el = document.getElementById("bookingSearchModal");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
}

function wire() {
    if (wired) return;
    const el = document.getElementById("bookingSearchModal");
    if (!el) return;

    const input = el.querySelector("#bk-search-input");
    const select = el.querySelector("#bk-search-event");
    const btnClear = el.querySelector("#bk-search-clear");
    const btnClose = el.querySelector("#bk-search-close");
    const btnCancel = el.querySelector("#bk-search-cancel");
    const tbody = el.querySelector("#bk-search-table tbody");

    updateEventFilterOptions(select);

    const rerender = () => renderTable(input?.value || "", select?.value || "");

    if (!unsubscribeEvents) {
        unsubscribeEvents = onEventsChange(() => {
            updateEventFilterOptions(select);
            rerender();
        });
    }

    // Suche & Filter
    input?.addEventListener("input", rerender);
    btnClear?.addEventListener("click", () => {
        if (input) input.value = "";
        rerender();
        input?.focus();
    });
    select?.addEventListener("change", () => {
        lastEventFilterId = select.value || "";
        rerender();
    });

    // Schließen
    btnClose?.addEventListener("click", closeModal);
    btnCancel?.addEventListener("click", closeModal);
    el.addEventListener("click", e => {
        if (e.target === el || e.target.classList.contains("modal__backdrop")) closeModal();
    });
    document.addEventListener("keydown", e => {
        if (!el.classList.contains("hidden") && e.key === "Escape") closeModal();
    });

    // Aktionen (Delegation)
    tbody?.addEventListener("click", e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const tr = btn.closest("tr[data-id][data-table]");
        if (!tr) return;

        const action = btn.getAttribute("data-action");
        const id = tr.getAttribute("data-id");
        const tableNr = parseInt(tr.getAttribute("data-table"), 10);
        const eventId = tr.getAttribute("data-event") || null;

        if (!Number.isInteger(tableNr)) {
            return;
        }

        if (!ensureEventActive(eventId)) {
            return;
        }

        ensureBucket(tableNr);
        const list = reservationsByTable[tableNr] || [];
        const idx = list.findIndex(r => r.id === id);
        if (idx < 0) return;
        const rec = list[idx];

        if (action === "edit") {
            if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht bearbeitet werden.");
            const newCount = parseInt(prompt(`Kartenanzahl für "${rec.name}" an ${tableLabel(tableNr)} ändern:`, rec.cards));
            if (!Number.isInteger(newCount) || newCount <= 0) return alert("Ungültige Anzahl.");
            const delta = newCount - rec.cards;
            if (delta !== 0) {
                const avail = getSeatsByTableNumber(tableNr) || 0;
                if (delta > 0 && avail < delta) return alert(`Nicht genug freie Plätze an ${tableLabel(tableNr)}. Verfügbar: ${avail}`);
                setSeatsByTableNumber(tableNr, avail - delta);
                rec.cards = newCount;
            }
            printTischArray(); // aktualisiert auch Select/Infos
            renderReservationsForSelectedTable();
            rerender();
        }

        if (action === "move") {
            if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht verschoben werden.");
            closeModal();
            setSelectedTableNr(tableNr); // Kontext setzen
            openMoveModal(tableNr, id);
        }

        if (action === "cart") {
            if (rec.sold) return alert("Als verkauft markierte Reservierungen können nicht in den Warenkorb gelegt werden.");
            addToCart(tableNr, id, eventId);
            renderReservationsForSelectedTable();
            rerender();
        }

        if (action === "cart-remove") {
            removeFromCart(tableNr, id, eventId);
            renderReservationsForSelectedTable();
            rerender();
        }

        if (action === "unsold") {
            rec.sold = false;
            markCartDirty();
            rerender();
            renderReservationsForSelectedTable();
        }

        if (action === "delete") {
            if (!confirm(`Reservierung von "${rec.name}" (${rec.cards} Karten, ${tableLabel(tableNr)}) wirklich löschen?`)) return;
            const avail = getSeatsByTableNumber(tableNr) || 0;
            setSeatsByTableNumber(tableNr, avail + rec.cards);
            list.splice(idx, 1);
            markCartDirty();
            printTischArray();
            renderReservationsForSelectedTable();
            rerender();
        }
    });

    wired = true;
}

export function openBookingSearchModal(initialFilter = "") {
    const el = ensureSearchModal();
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    wire();
    // initial render
    const input = el.querySelector("#bk-search-input");
    const select = el.querySelector("#bk-search-event");
    if (input) input.value = initialFilter;
    updateEventFilterOptions(select);
    if (select && lastEventFilterId && Array.from(select.options).some(option => option.value === lastEventFilterId)) {
        select.value = lastEventFilterId;
    }
    lastEventFilterId = select?.value || "";
    renderTable(initialFilter, select?.value || "");
    // Fokus auf Suche
    setTimeout(() => {
        input?.focus();
        if (initialFilter) {
            input?.select();
        }
    }, 0);
}
