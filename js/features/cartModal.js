import {
    reservationsByTable,
    ensureBucket,
    escapeHtml,
    noteToHtml,
    buildSplitInfoText,
    getSeatsByTableNumber,
    setSeatsByTableNumber,
    tableLabel,
    onCardPriceChange,
} from "../core/state.js";
import { getCartEntries, removeFromCart, markCartAsSold, onCartChange, calculateCartTotal, markCartDirty } from "./cart.js";
import { printTischArray, renderReservationsForSelectedTable, setSelectedTableNr } from "../ui/tableView.js";
import { openMoveModal } from "./modalMoveSwap.js";

const euroFormatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
});

function icon(name) {
    const common = 'class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    switch (name) {
        case "edit":        return `<svg ${common}><path d="M12 20h9"/><path d="M16.5 3.5A2.121 2.121 0 1 1 19.5 6.5L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
        case "move":        return `<svg ${common}><polyline points="5 12 9 8 5 4"/><line x1="9" y1="8" x2="15" y2="8"/><polyline points="19 12 15 16 19 20"/><line x1="15" y1="16" x2="9" y2="16"/></svg>`;
        case "cart-remove": return `<svg ${common}><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61H19a2 2 0 0 0 2-1.61L23 6H6"/><line x1="4" y1="4" x2="22" y2="22"/></svg>`;
        case "delete":      return `<svg ${common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
        default:             return "";
    }
}

function iconBtn({ action, title, ghost = false }) {
    const cls = `btn icon-btn ${ghost ? "btn--ghost" : ""} ${action === "cart-remove" ? "icon-btn--cart" : ""}`.trim();
    const aria = title.replace(/"/g, "'");
    const svg = icon(action);
    return `<button class="${cls}" data-action="${action}" title="${aria}" aria-label="${aria}">${svg}</button>`;
}

let wired = false;

function ensureCartModal() {
    let el = document.getElementById("cartModal");
    if (el) return el;

    const wrap = document.createElement("div");
    wrap.innerHTML = `
  <div id="cartModal" class="modal hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="cartModalTitle">
    <div class="modal__backdrop"></div>
    <div class="modal__dialog">
      <header class="modal__header">
        <h3 id="cartModalTitle">Warenkorb</h3>
        <button type="button" class="modal__close" id="cartModalClose" aria-label="Schließen">×</button>
      </header>
      <div class="modal__body">
        <div class="cart-summary" id="cart-summary" style="display:flex; gap:16px; flex-wrap:wrap; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <strong><span id="cart-summary-count">0</span> Reservierungen</strong>
            <span id="cart-summary-empty" style="display:none; opacity:.75;">Der Warenkorb ist leer.</span>
          </div>
          <div style="font-size:16px;">
            Gesamtpreis: <strong id="cart-summary-total">0,00 €</strong>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table table--compact" id="cart-table" style="width:100%;">
            <thead>
              <tr>
                <th style="min-width:160px; text-align:left;">Name (+ Booking-ID)</th>
                <th style="width:110px;">Tisch</th>
                <th style="width:90px;">Karten</th>
                <th>Notizen</th>
                <th style="width:260px;">Aktionen</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      <footer class="modal__footer">
        <div class="modal__actions" style="margin-left:auto; display:flex; gap:8px;">
          <button class="btn btn--ghost" id="cartModalCancel" type="button">Schließen</button>
          <button class="btn" id="cartModalSell" type="button" disabled>Verkaufen</button>
        </div>
      </footer>
    </div>
  </div>`;
    document.body.appendChild(wrap.firstElementChild);
    return document.getElementById("cartModal");
}

function renderCartTable() {
    const modal = document.getElementById("cartModal");
    if (!modal) return;
    const tbody = modal.querySelector("#cart-table tbody");
    if (!tbody) return;

    const entries = getCartEntries();

    if (entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:.7;">Keine Reservierungen im Warenkorb.</td></tr>`;
    } else {
        tbody.innerHTML = entries.map(({ tableNr, reservation }) => {
            const bid = reservation.bookingId ? String(reservation.bookingId) : "—";
            const baseNotes = noteToHtml(reservation.notes);
            const splitInfo = buildSplitInfoText(reservation.bookingId, tableNr);
            const splitHtml = splitInfo ? `<div style="font-size:12px;opacity:.75;">${escapeHtml(splitInfo)}</div>` : "";
            const actions = [
                iconBtn({ action: "edit", title: "Bearbeiten" }),
                iconBtn({ action: "move", title: "Verschieben" }),
                iconBtn({ action: "cart-remove", title: "Aus Warenkorb entfernen" }),
                iconBtn({ action: "delete", title: "Löschen", ghost: true })
            ].join(" ");
            return `
      <tr data-id="${reservation.id}" data-table="${tableNr}">
        <td>
          ${escapeHtml(reservation.name)}
          <div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div>
        </td>
        <td>${escapeHtml(tableLabel(tableNr))}</td>
        <td>${reservation.cards}</td>
        <td>${baseNotes}${splitHtml}</td>
        <td class="actions" style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</td>
      </tr>`;
        }).join("");
    }

    const sellBtn = modal.querySelector("#cartModalSell");
    if (sellBtn) sellBtn.disabled = entries.length === 0;

    const countEl = modal.querySelector("#cart-summary-count");
    const emptyHint = modal.querySelector("#cart-summary-empty");
    if (countEl) countEl.textContent = String(entries.length);
    if (emptyHint) emptyHint.style.display = entries.length === 0 ? "inline" : "none";

    const totalEl = modal.querySelector("#cart-summary-total");
    if (totalEl) {
        const total = calculateCartTotal();
        totalEl.textContent = euroFormatter.format(total);
    }
}

function closeModal() {
    const el = document.getElementById("cartModal");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
}

function wire() {
    if (wired) return;
    const el = document.getElementById("cartModal");
    if (!el) return;

    const btnClose = el.querySelector("#cartModalClose");
    const btnCancel = el.querySelector("#cartModalCancel");
    const btnSell = el.querySelector("#cartModalSell");
    const tbody = el.querySelector("#cart-table tbody");

    btnClose?.addEventListener("click", closeModal);
    btnCancel?.addEventListener("click", closeModal);

    el.addEventListener("click", evt => {
        if (evt.target === el || evt.target.classList.contains("modal__backdrop")) {
            closeModal();
        }
    });

    document.addEventListener("keydown", evt => {
        const isOpen = !el.classList.contains("hidden");
        if (isOpen && evt.key === "Escape") {
            closeModal();
        }
    });

    tbody?.addEventListener("click", evt => {
        const btn = evt.target.closest("button[data-action]");
        if (!btn) return;
        const tr = btn.closest("tr[data-id][data-table]");
        if (!tr) return;

        const action = btn.getAttribute("data-action");
        const id = tr.getAttribute("data-id");
        const tableNr = parseInt(tr.getAttribute("data-table"), 10);
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
                if (delta > 0 && avail < delta) {
                    alert(`Nicht genug freie Plätze an ${tableLabel(tableNr)}. Verfügbar: ${avail}`);
                    return;
                }
                setSeatsByTableNumber(tableNr, avail - delta);
                rec.cards = newCount;
                printTischArray();
                renderReservationsForSelectedTable();
                renderCartTable();
                markCartDirty();
            }
        }

        if (action === "move") {
            if (rec.sold) return alert("Diese Buchung ist als verkauft markiert und kann nicht verschoben werden.");
            closeModal();
            setSelectedTableNr(tableNr);
            openMoveModal(tableNr, id);
        }

        if (action === "cart-remove") {
            removeFromCart(tableNr, id);
            renderReservationsForSelectedTable();
            renderCartTable();
        }

        if (action === "delete") {
            if (!confirm(`Reservierung von "${rec.name}" (${rec.cards} Karten, ${tableLabel(tableNr)}) wirklich löschen?`)) return;
            const avail = getSeatsByTableNumber(tableNr) || 0;
            setSeatsByTableNumber(tableNr, avail + rec.cards);
            list.splice(idx, 1);
            markCartDirty();
            printTischArray();
            renderReservationsForSelectedTable();
            renderCartTable();
        }
    });

    btnSell?.addEventListener("click", () => {
        const entries = getCartEntries();
        if (entries.length === 0) return;
        if (!confirm("Alle Reservierungen im Warenkorb als verkauft markieren?")) return;
        const { sold, totalCards } = markCartAsSold();
        printTischArray();
        renderReservationsForSelectedTable();
        renderCartTable();
        if (sold > 0) {
            const msg = sold === 1
                ? `1 Reservierung mit insgesamt ${totalCards} Karten wurde als verkauft markiert.`
                : `${sold} Reservierungen mit insgesamt ${totalCards} Karten wurden als verkauft markiert.`;
            alert(msg);
        }
    });

    onCartChange(() => {
        renderCartTable();
    });

    onCardPriceChange(() => {
        renderCartTable();
    });

    wired = true;
}

export function openCartModal() {
    const el = ensureCartModal();
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    wire();
    renderCartTable();
}