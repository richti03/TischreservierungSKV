// Rendering Tischliste, Select & Reservierungstabelle

import {
    tisch, reservationsByTable,
    sortTischArrayNr, getSeatsByTableNumber, ensureBucket,
    buildSplitInfoText, escapeHtml, noteToHtml
} from "../core/state.js";
import { broadcastInternalPlanState } from "../features/internalPlanSync.js";

let selectedTableNr = NaN;

export function getReservationTbody() {
    return document.querySelector('#reservationview table tbody');
}

let tableLabelHandlersBound = false;

function getTableLabelContainer() {
    return document.getElementById("tischAusgabe");
}

function parseTableNrFromElement(el) {
    if (!el) return NaN;
    const nr = parseInt(el.dataset.tableNr, 10);
    return Number.isNaN(nr) ? NaN : nr;
}

function activateTableLabel(el) {
    const nr = parseTableNrFromElement(el);
    if (Number.isNaN(nr)) {
        return;
    }
    setSelectedTableNr(nr);
}

function findTableLabelTarget(event) {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return null;
    return rawTarget.closest('[data-table-nr]');
}

function onTableLabelClick(event) {
    const target = findTableLabelTarget(event);
    if (!target) return;
    event.preventDefault();
    activateTableLabel(target);
}

function onTableLabelKeydown(event) {
    const isActivationKey = event.key === "Enter" || event.key === " " || event.key === "Spacebar";
    if (!isActivationKey) return;
    const target = findTableLabelTarget(event);
    if (!target) return;
    event.preventDefault();
    activateTableLabel(target);
}

function ensureTableLabelHandlers() {
    if (tableLabelHandlersBound) return;
    const container = getTableLabelContainer();
    if (!container) return;
    container.addEventListener("click", onTableLabelClick);
    container.addEventListener("keydown", onTableLabelKeydown);
    tableLabelHandlersBound = true;
}

function highlightTableLabel(nr) {
    const container = getTableLabelContainer();
    if (!container) return;
    const labels = container.querySelectorAll('[data-table-nr]');
    labels.forEach(label => {
        const value = parseTableNrFromElement(label);
        if (Number.isInteger(nr) && value === nr) {
            label.classList.add("is-active");
            label.setAttribute("aria-current", "true");
        } else {
            label.classList.remove("is-active");
            label.removeAttribute("aria-current");
        }
    });
}

export function getSelectedTableNr() {
    const select = document.getElementById("table-select");
    if (select) {
        const nr = parseInt(select.value, 10);
        return Number.isNaN(nr) ? NaN : nr;
    }
    return Number.isNaN(selectedTableNr) ? NaN : selectedTableNr;
}

export function setSelectedTableNr(nr) {
    const normalized = Number.isInteger(nr) ? nr : NaN;
    selectedTableNr = normalized;
    const select = document.getElementById("table-select");
    if (select) {
        if (Number.isInteger(normalized)) {
            select.value = String(normalized);
        } else {
            select.value = "";
        }
        updateFooter();
        renderReservationsForSelectedTable();
        const changeEvent = new Event("change", { bubbles: true });
        select.dataset.silentTableUpdate = "1";
        select.dispatchEvent(changeEvent);
        delete select.dataset.silentTableUpdate;
        console.log("[UI] Select auf Tisch gesetzt:", normalized);
    } else {
        updateFooter();
        renderReservationsForSelectedTable();
        console.log("[UI] Tisch gesetzt (ohne Select):", normalized);
    }
}

export function printTischArray(arr = tisch) {
    sortTischArrayNr(arr);
    let output = "";
    for (let i = 1; i < arr.length; i++) {
        output += `<span class="table-label" data-table-nr="${arr[i][0]}" role="button" tabindex="0">Tisch ${arr[i][0]}: ${arr[i][1]} Plätze</span><br>`;
    }
    output += `<span class="table-label" data-table-nr="0" role="button" tabindex="0">Stehplätze: ${arr[0][1]} Plätze</span><br>`;
    const outEl = document.getElementById("tischAusgabe");
    if (outEl) {
        outEl.innerHTML = output;
        ensureTableLabelHandlers();
        highlightTableLabel(getSelectedTableNr());
    }
    renderTableSelect();
    console.log("[UI] Tische neu gerendert.");
    broadcastInternalPlanState("tables-render")
}

export function renderTableSelect(preserveSelection = true) {
    sortTischArrayNr(tisch);
    const select = document.getElementById("table-select");
    if (!select) return;

    const prev = preserveSelection ? parseInt(select.value, 10) : NaN;

    select.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.textContent = "Bitte Tisch auswählen.";
    opt0.disabled = true;
    opt0.selected = isNaN(prev);
    select.appendChild(opt0);

    for (let i = 1; i < tisch.length; i++) {
        const [nr, plaetze] = tisch[i];
        const opt = document.createElement("option");
        opt.value = nr;
        opt.textContent = `Tisch ${nr} (${plaetze} Plätze)`;
        if (!isNaN(prev) && nr === prev) opt.selected = true;
        select.appendChild(opt);
    }

    const optSteh = document.createElement("option");
    optSteh.value = 0;
    optSteh.textContent = `Stehplätze (${tisch[0][1]})`;
    if (!isNaN(prev) && 0 === prev) optSteh.selected = true;
    select.appendChild(optSteh);

    updateFooter();
    renderReservationsForSelectedTable();
    console.log("[UI] Select neu aufgebaut. Ausgewählt:", select.value || "(keiner)");
}

export function updateFooter() {
    const strong = document.getElementById("available-cards");
    if (!strong) return;
    const nr = getSelectedTableNr();
    const val = getSeatsByTableNumber(nr);
    strong.textContent = Number.isInteger(val) ? val : "—";
}

/* -------- Icons & Icon-Buttons (inline SVG) ---------- */
function icon(name) {
    const common = 'class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    switch (name) {
        case "edit":   return `<svg ${common}><path d="M12 20h9"/><path d="M16.5 3.5A2.121 2.121 0 1 1 19.5 6.5L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
        case "note":   return `<svg ${common}><path d="M3 7a4 4 0 0 1 4-4h7l7 7v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7z"/><path d="M14 3v6h6"/></svg>`;
        case "move":   return `<svg ${common}><polyline points="5 12 9 8 5 4"/><line x1="9" y1="8" x2="15" y2="8"/><polyline points="19 12 15 16 19 20"/><line x1="15" y1="16" x2="9" y2="16"/></svg>`;
        case "sold":   return `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`;
        case "unsold": return `<svg ${common}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
        case "trash":  return `<svg ${common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
        default:       return "";
    }
}
function iconBtn({ action, id, title, ghost=false, disabled=false, extraClass="" }) {
    const cls = `btn icon-btn ${ghost ? "btn--ghost" : ""} ${extraClass}`.trim();
    const aria = title.replace(/"/g, "'");
    const dis = disabled ? "disabled" : "";
    const svg = (
        action === "edit"   ? icon("edit")   :
            action === "note"   ? icon("note")   :
                action === "move"   ? icon("move")   :
                    action === "sold"   ? icon("sold")   :
                        action === "unsold" ? icon("unsold") :
                            action === "delete" ? icon("trash")  : ""
    );
    return `<button class="${cls}" data-action="${action}" data-id="${id}" title="${aria}" aria-label="${aria}" ${dis}>${svg}</button>`;
}

/* ----------------------------------------------------- */

export function renderReservationsForSelectedTable() {
    const nr = getSelectedTableNr();
    const tbody = getReservationTbody();
    if (!tbody) return;

    highlightTableLabel(nr);

    if (!Number.isInteger(nr)) {
        tbody.innerHTML = `<tr><td colspan="4">Bitte einen Tisch auswählen.</td></tr>`;
        broadcastInternalPlanState("reservations-render")
        return;
    }

    ensureBucket(nr);
    const list = reservationsByTable[nr];

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Keine Reservierungen für Tisch ${nr}.</td></tr>`;
        broadcastInternalPlanState("reservations-render")
        return;
    }

    const rows = list.map(r => {
        const bid = r.bookingId ? String(r.bookingId) : "—";
        const baseNotes = noteToHtml(r.notes);
        const splitInfo = buildSplitInfoText(r.bookingId, nr);
        const splitInfoHtml = splitInfo ? `<div style="font-size:12px; opacity:.75;">${escapeHtml(splitInfo)}</div>` : "";
        const soldClass = r.sold ? ' class="is-sold"' : "";

        let actionsHtml = "";
        if (r.sold) {
            actionsHtml = iconBtn({ action:"unsold", id:r.id, title:"Verkauf rückgängig" });
        } else {
            actionsHtml = [
                iconBtn({ action:"edit",   id:r.id, title:"Bearbeiten" }),
                iconBtn({ action:"move",   id:r.id, title:"Verschieben" }),
                iconBtn({ action:"sold",   id:r.id, title:"Als verkauft markieren" }),
                iconBtn({ action:"delete", id:r.id, title:"Löschen", ghost:true })
            ].join(" ");
        }

        return `
      <tr data-id="${r.id}"${soldClass}>
        <td>
          ${escapeHtml(r.name)}
          <div style="font-size:12px; opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div>
        </td>
        <td>${r.cards}</td>
        <td>${baseNotes}${splitInfoHtml}</td>
        <td class="actions" style="display:flex;gap:6px;flex-wrap:wrap;">${actionsHtml}</td>
      </tr>`;
    }).join("");

    tbody.innerHTML = rows;
    broadcastInternalPlanState("reservations-render")
}
