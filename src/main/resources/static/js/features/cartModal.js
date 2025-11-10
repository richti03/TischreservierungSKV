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
import { getActiveEvent, setActiveEvent } from "../core/events.js";
import { getCartEntries, removeFromCart, markCartAsSold, onCartChange, calculateCartTotal, markCartDirty } from "./cart.js";
import { printTischArray, renderReservationsForSelectedTable, setSelectedTableNr } from "../ui/tableView.js";
import { openMoveModal } from "./modalMoveSwap.js";
import { createInvoiceFromCart, getPaymentLabel } from "./invoices.js";

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
let paymentDialogOpen = false;
let postSaleModalWired = false;
let postSaleModal = null;
let postSaleMessageEl = null;
let postSaleDetailsEl = null;
let postSaleDownloadBtn = null;

function ensurePostSaleModal() {
    if (postSaleModal) {
        return postSaleModal;
    }
    const modal = document.getElementById("post-sale-modal");
    if (!modal) {
        return null;
    }
    postSaleModal = modal;
    postSaleMessageEl = modal.querySelector("#post-sale-message");
    postSaleDetailsEl = modal.querySelector("#post-sale-details");
    postSaleDownloadBtn = document.getElementById("btn-download-latest-invoice");

    if (!postSaleModalWired) {
        const closeTargets = modal.querySelectorAll('[data-close-modal]');
        closeTargets.forEach(target => {
            target.addEventListener("click", evt => {
                evt.preventDefault();
                closePostSaleModal();
            });
        });

        if (postSaleDownloadBtn) {
            postSaleDownloadBtn.addEventListener("click", evt => {
                if (postSaleDownloadBtn.getAttribute("aria-disabled") === "true") {
                    evt.preventDefault();
                }
            });
        }

        document.addEventListener("customerFlow:close-modals", closePostSaleModal);
        document.addEventListener("customerFlow:next-customer", () => {
            clearPostSaleModal();
        });

        document.addEventListener("keydown", evt => {
            if (evt.key === "Escape" && postSaleModal && !postSaleModal.classList.contains("hidden")) {
                closePostSaleModal();
            }
        });

        postSaleModalWired = true;
    }

    return postSaleModal;
}

function clearPostSaleModal() {
    if (postSaleMessageEl) {
        postSaleMessageEl.textContent = "";
    }
    if (postSaleDetailsEl) {
        postSaleDetailsEl.textContent = "";
    }
    if (postSaleDownloadBtn) {
        postSaleDownloadBtn.removeAttribute("href");
        postSaleDownloadBtn.removeAttribute("download");
        postSaleDownloadBtn.setAttribute("aria-disabled", "true");
    }
}

function closePostSaleModal() {
    const modal = ensurePostSaleModal();
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    clearPostSaleModal();
}

function openPostSaleModal(invoice, { sold = 0, totalCards = 0, paymentMethod = "cash" } = {}) {
    const modal = ensurePostSaleModal();
    if (!modal || !postSaleDownloadBtn) {
        return false;
    }

    clearPostSaleModal();

    const paymentLabel = getPaymentLabel(paymentMethod);
    const reservationLabel = sold === 1 ? "1 Reservierung" : `${sold} Reservierungen`;
    const cardLabel = totalCards === 1 ? "1 Karte" : `${totalCards} Karten`;

    if (postSaleMessageEl) {
        postSaleMessageEl.textContent = `Rechnung ${invoice.invoiceNumber} wurde erstellt.`;
    }

    const parts = [];
    if (sold > 0) {
        parts.push(reservationLabel);
    }
    if (totalCards > 0) {
        parts.push(cardLabel);
    }
    if (Number.isFinite(invoice?.totalAmount)) {
        parts.push(`Gesamtbetrag ${euroFormatter.format(invoice.totalAmount)}`);
    }
    if (paymentLabel) {
        parts.push(`Zahlart ${paymentLabel}`);
    }
    parts.push("Kundendisplay: DANKE! SANDORIA HELLAU!");

    if (postSaleDetailsEl) {
        postSaleDetailsEl.textContent = parts.join(" · ");
    }

    if (invoice?.dataUrl) {
        postSaleDownloadBtn.href = invoice.dataUrl;
        postSaleDownloadBtn.download = invoice.fileName || "Rechnung.pdf";
        postSaleDownloadBtn.removeAttribute("aria-disabled");
    } else {
        postSaleDownloadBtn.removeAttribute("href");
        postSaleDownloadBtn.removeAttribute("download");
        postSaleDownloadBtn.setAttribute("aria-disabled", "true");
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    postSaleDownloadBtn?.focus({ preventScroll: true });
    return true;
}

function ensurePaymentDialog() {
    let el = document.getElementById("paymentMethodDialog");
    if (el) return el;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
  <div id="paymentMethodDialog" class="payment-dialog hidden" aria-hidden="true">
    <div class="payment-dialog__backdrop" data-cancel="1"></div>
    <div class="payment-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
      <button type="button" class="payment-dialog__close" data-cancel="1" aria-label="Dialog schließen">×</button>
      <h2 class="payment-dialog__title" id="payment-dialog-title">Wie hat der Kunde bezahlt?</h2>
      <p class="payment-dialog__text">Bitte wählen Sie die Zahlart.</p>
      <div class="payment-dialog__actions">
        <button type="button" class="btn payment-dialog__btn" data-method="cash">Barzahlung</button>
        <button type="button" class="btn payment-dialog__btn" data-method="card">Kartenzahlung</button>
        <button type="button" class="btn payment-dialog__btn payment-dialog__btn--secondary" data-cancel="1">Abbrechen</button>
      </div>
    </div>
  </div>`;
    document.body.appendChild(wrap.firstElementChild);
    return document.getElementById("paymentMethodDialog");
}

function promptPaymentMethod() {
    const el = ensurePaymentDialog();
    const methodButtons = Array.from(el.querySelectorAll("[data-method]"));
    const cancelTargets = Array.from(el.querySelectorAll("[data-cancel]"));
    return new Promise(resolve => {
        if (paymentDialogOpen) {
            resolve(null);
            return;
        }
        paymentDialogOpen = true;
        let finished = false;

        const cleanup = value => {
            if (finished) return;
            finished = true;
            paymentDialogOpen = false;
            el.classList.add("hidden");
            el.setAttribute("aria-hidden", "true");
            methodButtons.forEach(btn => btn.removeEventListener("click", onSelect));
            cancelTargets.forEach(btn => btn.removeEventListener("click", onCancel));
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("customerFlow:close-modals", onGlobalClose);
            resolve(value);
        };

        const onSelect = evt => {
            const method = evt.currentTarget?.getAttribute("data-method") || "";
            if (method === "cash" || method === "card") {
                cleanup(method);
            } else {
                cleanup(null);
            }
        };

        const onCancel = () => cleanup(null);

        const onKey = evt => {
            if (evt.key === "Escape") {
                evt.preventDefault();
                cleanup(null);
            }
        };

        const onGlobalClose = () => cleanup(null);

        methodButtons.forEach(btn => btn.addEventListener("click", onSelect));
        cancelTargets.forEach(btn => btn.addEventListener("click", onCancel));
        document.addEventListener("keydown", onKey);
        document.addEventListener("customerFlow:close-modals", onGlobalClose);

        el.classList.remove("hidden");
        el.setAttribute("aria-hidden", "false");
        methodButtons[0]?.focus();
    });
}

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
        console.warn("[CART MODAL] Veranstaltung konnte nicht aktiviert werden:", eventId);
    }
    return success;
}

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
                <th style="min-width:160px;">Veranstaltung</th>
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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; opacity:.7;">Keine Reservierungen im Warenkorb.</td></tr>`;
    } else {
        tbody.innerHTML = entries.map(entry => {
            const { tableNr, reservation, eventId, eventDisplayName, eventName, eventState } = entry;
            const bid = reservation.bookingId ? String(reservation.bookingId) : "—";
            const baseNotes = noteToHtml(reservation.notes);
            const splitInfo = buildSplitInfoText(reservation.bookingId, tableNr, eventState?.reservationsByTable);
            const splitHtml = splitInfo ? `<div style="font-size:12px;opacity:.75;">${escapeHtml(splitInfo)}</div>` : "";
            const actions = [
                iconBtn({ action: "edit", title: "Bearbeiten" }),
                iconBtn({ action: "move", title: "Verschieben" }),
                iconBtn({ action: "cart-remove", title: "Aus Warenkorb entfernen" }),
                iconBtn({ action: "delete", title: "Löschen", ghost: true })
            ].join(" ");
            const eventLabel = escapeHtml(eventDisplayName || eventName || "—");
            const tableText = escapeHtml(tableLabel(tableNr));
            const cardValue = typeof reservation?.cards === 'number'
                ? reservation.cards
                : (reservation?.cards != null ? reservation.cards : "");
            const cardText = escapeHtml(String(cardValue));
            const nameText = escapeHtml(reservation?.name || "—");
            return `
      <tr data-id="${reservation.id}" data-table="${tableNr}" data-event="${eventId ?? ""}">
        <td>
          ${nameText}
          <div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div>
        </td>
        <td>${eventLabel}</td>
        <td>${tableText}</td>
        <td>${cardText}</td>
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
        const eventId = tr.getAttribute("data-event") || null;
        if (!Number.isInteger(tableNr)) return;

        if (!ensureEventActive(eventId)) {
            return;
        }

        ensureBucket(tableNr);
        const list = reservationsByTable[tableNr] || [];
        const idx = list.findIndex(r => r.id === id);
        if (idx < 0) return;
        const rec = list[idx];

        setSelectedTableNr(tableNr);

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
            openMoveModal(tableNr, id);
        }

        if (action === "cart-remove") {
            removeFromCart(tableNr, id, eventId);
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

    btnSell?.addEventListener("click", async () => {
        const entries = getCartEntries();
        if (entries.length === 0) return;

        const paymentMethod = await promptPaymentMethod();
        if (!paymentMethod) {
            return;
        }

        const originalLabel = btnSell.textContent;
        btnSell.disabled = true;
        btnSell.textContent = "Verarbeitung …";

        try {
            const invoice = await createInvoiceFromCart(entries, { paymentMethod });
            const { sold, totalCards } = markCartAsSold();
            printTischArray();
            renderReservationsForSelectedTable();
            renderCartTable();
            closeModal();

            const opened = openPostSaleModal(invoice, { sold, totalCards, paymentMethod });
            if (!opened) {
                const paymentLabel = getPaymentLabel(paymentMethod);
                const baseMsg = sold === 1
                    ? `1 Reservierung mit insgesamt ${totalCards} Karten wurde als verkauft markiert.`
                    : `${sold} Reservierungen mit insgesamt ${totalCards} Karten wurden als verkauft markiert.`;
                alert(`${baseMsg}\nRechnung ${invoice.invoiceNumber} (${paymentLabel}) wurde erstellt.`);
            }
        } catch (err) {
            console.error("[CART MODAL] Rechnung konnte nicht erstellt werden:", err);
            alert(`Rechnung konnte nicht erstellt werden: ${err?.message || err}`);
        } finally {
            btnSell.textContent = originalLabel;
            btnSell.disabled = getCartEntries().length === 0;
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