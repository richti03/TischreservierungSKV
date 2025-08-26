// Rendering Tischliste, Select & Reservierungstabelle

import {
    tisch, reservationsByTable,
    sortTischArrayNr, getSeatsByTableNumber, ensureBucket,
    buildSplitInfoText, escapeHtml, noteToHtml
} from "../core/state.js";

export function getReservationTbody() {
    return document.querySelector('#reservationview table tbody');
}

export function getSelectedTableNr() {
    const select = document.getElementById("table-select");
    return select ? parseInt(select.value) : NaN;
}

export function setSelectedTableNr(nr) {
    const select = document.getElementById("table-select");
    if (!select) return;
    select.value = nr;
    updateFooter();
    renderReservationsForSelectedTable();
    console.log("[UI] Select auf Tisch gesetzt:", nr);
}

export function printTischArray(arr = tisch) {
    sortTischArrayNr(arr);
    let output = "";
    for (let i = 0; i < arr.length; i++) {
        output += `Tisch ${arr[i][0]}: ${arr[i][1]} Plätze<br>`;
    }
    const outEl = document.getElementById("tischAusgabe");
    if (outEl) outEl.innerHTML = output;
    renderTableSelect();
    console.log("[UI] Tische neu gerendert.");
}

export function renderTableSelect(preserveSelection = true) {
    sortTischArrayNr(tisch);
    const select = document.getElementById("table-select");
    if (!select) return;

    const prev = preserveSelection ? parseInt(select.value) : NaN;

    select.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.textContent = "Bitte Tisch auswählen.";
    opt0.disabled = true;
    opt0.selected = isNaN(prev);
    select.appendChild(opt0);

    for (let i = 0; i < tisch.length; i++) {
        const [nr, plaetze] = tisch[i];
        const opt = document.createElement("option");
        opt.value = nr;
        opt.textContent = `Tisch ${nr} (${plaetze} Plätze)`;
        if (!isNaN(prev) && nr === prev) opt.selected = true;
        select.appendChild(opt);
    }

    updateFooter();
    renderReservationsForSelectedTable();
    console.log("[UI] Select neu aufgebaut. Ausgewählt:", select.value || "(keiner)");
}

export function updateFooter() {
    const select = document.getElementById("table-select");
    const strong = document.getElementById("available-cards");
    if (!strong) return;
    const nr = select ? parseInt(select.value) : NaN;
    const val = getSeatsByTableNumber(nr);
    strong.textContent = Number.isInteger(val) ? val : "—";
}

export function renderReservationsForSelectedTable() {
    const nr = getSelectedTableNr();
    const tbody = getReservationTbody();
    if (!tbody) return;

    if (!Number.isInteger(nr)) {
        tbody.innerHTML = `<tr><td colspan="4">Bitte oben einen Tisch auswählen.</td></tr>`;
        return;
    }

    ensureBucket(nr);
    const list = reservationsByTable[nr];

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Keine Reservierungen für Tisch ${nr}.</td></tr>`;
        return;
    }

    const rows = list.map(r => {
        const ts = new Date(r.ts).toLocaleString();
        const baseNotes = noteToHtml(r.notes);
        const splitInfo = buildSplitInfoText(r.bookingId, nr);
        const splitInfoHtml = splitInfo ? `<div style="font-size:12px; opacity:.75;">${escapeHtml(splitInfo)}</div>` : "";
        return `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.name)}<div style="font-size:12px; opacity:.7;">${ts}</div></td>
        <td>${r.cards}</td>
        <td>${baseNotes}${splitInfoHtml}</td>
        <td class="actions">
          <button class="btn" data-action="edit"      data-id="${r.id}">Bearbeiten</button>
          <button class="btn" data-action="note"      data-id="${r.id}">Notiz</button>
          <button class="btn" data-action="move"      data-id="${r.id}">Verschieben</button>
          <button class="btn btn--ghost" data-action="delete" data-id="${r.id}">Löschen</button>
        </td>
      </tr>`;
    }).join("");

    tbody.innerHTML = rows;
}
