// Verschieben/Tauschen-Modal – Prüfen → Vorschau → Ausführen (mit Reservierungs-Vorschau, SOLD-Handling)

import {
    tisch, reservationsByTable,
    ensureBucket, getSeatsByTableNumber, setSeatsByTableNumber,
    sortTischArrayNr, uid, escapeHtml, noteToHtml, buildSplitInfoText, tableLabel, markEventStateDirty
} from "../core/state.js";
import { printTischArray, setSelectedTableNr } from "../ui/tableView.js";

let moveState = { mode: "move", sourceNr: null, targetNr: null, preselectId: null, previewOk: false };
let modalWired = false;

function ensureMoveModal() {
    let el = document.getElementById("moveModal");
    let needsUpgrade = false;
    if (el) {
        const requiredIds = [
            "moveModalApply","moveModalCheck","mm-preview","mm-total-LR",
            "mm-target-select","mm-source-table","mm-target-table",
            "mm-prev-src-ok","mm-prev-src-err",
            "mm-prev-src-res-table","mm-prev-tgt-res-table"
        ];
        needsUpgrade = requiredIds.some(id => !el.querySelector("#" + id));
    }
    if (!el || needsUpgrade) {
        if (el) el.remove();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `
    <div id="moveModal" class="modal hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="moveModalTitle">
      <div class="modal__backdrop"></div>
      <div class="modal__dialog">
        <header class="modal__header">
          <h3 id="moveModalTitle">Reservierung verschieben / tauschen</h3>
          <button type="button" class="modal__close" id="moveModalClose" aria-label="Schließen">×</button>
        </header>

        <div class="modal__body">
          <div class="modal__controls">
            <label><input type="radio" name="moveMode" value="move" checked> Verschieben</label>
            <label style="margin-left:8px;"><input type="radio" name="moveMode" value="swap"> Tauschen</label>
            <span id="mm-hint" class="mm-hint">Modus „Verschieben“: Ziel-Tisch braucht genügend freie Plätze.</span>
          </div>

          <div class="modal__grid">
            <section class="modal__col">
              <h4>Quelle: Tisch <span id="mm-source-nr">—</span></h4>
              <table class="table table--compact" id="mm-source-table">
                <thead>
                  <tr><th>Auswahl</th><th>Name</th><th>Karten</th><th>Notizen</th><th style="min-width:130px;">Zu verschiebende Karten</th></tr>
                </thead><tbody></tbody>
              </table>
            </section>

            <section class="modal__col">
              <h4>Ziel: <select id="mm-target-select" style="margin-left:6px;"></select></h4>
              <table class="table table--compact" id="mm-target-table">
                <thead>
                  <tr><th>Auswahl</th><th>Name</th><th>Karten</th><th>Notizen</th><th style="min-width:130px;">Zu verschiebende Karten</th></tr>
                </thead><tbody></tbody>
              </table>
            </section>
          </div>

          <!-- Vorschau -->
          <div id="mm-preview" class="mm-preview" style="display:none;">
            <div class="mm-card" id="mm-prev-source">
              <h5>Quelle (Tisch <span id="mm-prev-src-nr">—</span>)</h5>
              <div class="mm-meta" style="margin-bottom:8px;">
                <span class="badge">Frei alt: <span id="mm-prev-src-free-old">0</span></span>
                <span class="badge">Frei neu: <span id="mm-prev-src-free-new">0</span></span>
                <span class="badge badge--ok"  id="mm-prev-src-ok"  style="display:none;">Prüfung OK</span>
                <span class="badge badge--err" id="mm-prev-src-err" style="display:none;">Überbucht</span>
              </div>
              <table class="table table--compact" id="mm-prev-src-res-table">
                <thead><tr><th>Name</th><th>Karten</th><th>Notizen</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>

            <div class="mm-card" id="mm-prev-target">
              <h5>Ziel (Tisch <span id="mm-prev-tgt-nr">—</span>)</h5>
              <div class="mm-meta" style="margin-bottom:8px;">
                <span class="badge">Frei alt: <span id="mm-prev-tgt-free-old">0</span></span>
                <span class="badge">Frei neu: <span id="mm-prev-tgt-free-new">0</span></span>
                <span class="badge badge--ok"  id="mm-prev-ok"      style="display:none;">Prüfung OK</span>
                <span class="badge badge--err" id="mm-prev-tgt-err" style="display:none;">Überbucht</span>
              </div>
              <table class="table table--compact" id="mm-prev-tgt-res-table">
                <thead><tr><th>Name</th><th>Karten</th><th>Notizen</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <footer class="modal__footer">
          <div class="modal__totals">
            <span>Links → Rechts: <strong id="mm-total-LR">0</strong></span>
            <span class="swap-only"> | Rechts → Links: <strong id="mm-total-RL">0</strong></span>
          </div>
          <div class="modal__actions">
            <button class="btn btn--ghost" id="moveModalCancel" type="button">Abbrechen</button>
            <button class="btn" id="moveModalCheck" type="button">Prüfen</button>
            <button class="btn" id="moveModalApply" type="button" disabled>Ausführen</button>
          </div>
        </footer>
      </div>
    </div>`;
        document.body.appendChild(wrapper.firstElementChild);
        console.log("[MODAL] Modal (aktuelle Version) in DOM eingefügt.");
    }
    return true;
}

function refs() {
    const el = document.getElementById("moveModal");
    return {
        el,
        srcTable: document.getElementById("mm-source-table"),
        tgtTable: document.getElementById("mm-target-table"),
        srcNr: document.getElementById("mm-source-nr"),
        tgtSelect: document.getElementById("mm-target-select"),
        hint: document.getElementById("mm-hint"),
        btnApply: document.getElementById("moveModalApply"),
        btnCheck: document.getElementById("moveModalCheck"),
        btnClose: document.getElementById("moveModalClose"),
        btnCancel: document.getElementById("moveModalCancel"),
        // preview
        prevWrap: document.getElementById("mm-preview"),
        prevSrcNr: document.getElementById("mm-prev-src-nr"),
        prevSrcFreeOld: document.getElementById("mm-prev-src-free-old"),
        prevSrcFreeNew: document.getElementById("mm-prev-src-free-new"),
        prevSrcOk: document.getElementById("mm-prev-src-ok"),
        prevSrcErr: document.getElementById("mm-prev-src-err"),
        prevTgtNr: document.getElementById("mm-prev-tgt-nr"),
        prevTgtFreeOld: document.getElementById("mm-prev-tgt-free-old"),
        prevTgtFreeNew: document.getElementById("mm-prev-tgt-free-new"),
        prevTgtErr: document.getElementById("mm-prev-tgt-err"),
        prevOk: document.getElementById("mm-prev-ok"),
        totalLR: document.getElementById("mm-total-LR"),
        totalRL: document.getElementById("mm-total-RL"),
        prevSrcResTbody: document.querySelector("#mm-prev-src-res-table tbody"),
        prevTgtResTbody: document.querySelector("#mm-prev-tgt-res-table tbody"),
    };
}

function resetPreview() {
    const { prevWrap, btnApply, prevOk, prevTgtErr, prevSrcOk, prevSrcErr } = refs();
    moveState.previewOk = false;
    if (btnApply) btnApply.disabled = true;
    if (prevWrap) prevWrap.style.display = "none";
    if (prevOk) prevOk.style.display = "none";
    if (prevTgtErr) prevTgtErr.style.display = "none";
    if (prevSrcOk) prevSrcOk.style.display = "none";
    if (prevSrcErr) prevSrcErr.style.display = "none";
}

// --- Tabellen (Quelle/Ziel) im Hauptbereich ---

function renderSourceTable() {
    const { srcTable } = refs();
    ensureBucket(moveState.sourceNr);
    const list = reservationsByTable[moveState.sourceNr];
    const rows = list.map(r => {
        const checked = (r.id === moveState.preselectId) && !r.sold ? "checked" : "";
        const disBySold = r.sold ? "disabled" : "";
        const disabled = (checked || r.sold) ? "" : "disabled"; // Menge nur enabled wenn ausgewählt & nicht sold
        const split = buildSplitInfoText(r.bookingId, moveState.sourceNr);
        const notesHtml = noteToHtml(r.notes) + (split ? `<div style="font-size:12px;opacity:.75;">${escapeHtml(split)}</div>` : "");
        const bid = r.bookingId ? String(r.bookingId) : "—";
        const soldClass = r.sold ? ' class="is-sold"' : '';
        const checkboxAttr = r.sold ? 'disabled title="Als verkauft markiert – nicht verschiebbar."' : '';
        const amountAttr   = r.sold ? 'disabled' : (checked ? '' : 'disabled');
        return `
      <tr data-id="${r.id}"${soldClass}>
        <td><input type="checkbox" class="mm-src-check" ${checked} ${checkboxAttr}></td>
        <td>
          ${escapeHtml(r.name)}
          <div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div>
        </td>
        <td>${r.cards}</td>
        <td>${notesHtml}</td>
        <td><input type="number" class="mm-src-amt" min="1" max="${r.cards}" value="${r.cards}" ${amountAttr}></td>
      </tr>`;
    }).join("");
    srcTable.querySelector("tbody").innerHTML = rows;
}

function renderTargetTable() {
    const { tgtTable, tgtSelect } = refs();
    const targetNr = parseInt(tgtSelect && tgtSelect.value);
    moveState.targetNr = Number.isInteger(targetNr) ? targetNr : null;

    let rows = `<tr><td colspan="5">Bitte Ziel-Tisch wählen.</td></tr>`;
    if (Number.isInteger(moveState.targetNr)) {
        ensureBucket(moveState.targetNr);
        const list = reservationsByTable[moveState.targetNr];
        rows = list.map(r => {
            const disForMode = (moveState.mode === "swap") ? "" : "disabled";
            const disBySold  = r.sold ? "disabled" : "";
            const combinedDis = (moveState.mode === "swap" ? (r.sold ? "disabled" : "") : "disabled");
            const split = buildSplitInfoText(r.bookingId, moveState.targetNr);
            const notesHtml = noteToHtml(r.notes) + (split ? `<div style="font-size:12px;opacity:.75;">${escapeHtml(split)}</div>` : "");
            const bid = r.bookingId ? String(r.bookingId) : "—";
            const soldClass = r.sold ? ' class="is-sold"' : '';
            const checkboxAttr = (moveState.mode === "swap")
                ? (r.sold ? 'disabled title="Als verkauft markiert – nicht tauschbar."' : '')
                : 'disabled';
            const amountAttr = (moveState.mode === "swap")
                ? (r.sold ? 'disabled' : 'disabled') // Menge bleibt standardmäßig disabled, wird nur bei Auswahl enabled; sold bleibt disabled
                : 'disabled';
            return `
        <tr data-id="${r.id}"${soldClass}>
          <td><input type="checkbox" class="mm-tgt-check" ${checkboxAttr}></td>
          <td>
            ${escapeHtml(r.name)}
            <div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div>
          </td>
          <td>${r.cards}</td>
          <td>${notesHtml}</td>
          <td><input type="number" class="mm-tgt-amt" min="1" max="${r.cards}" value="${r.cards}" disabled></td>
        </tr>`;
        }).join("");
        if (list.length === 0) rows = `<tr><td colspan="5">Keine Reservierungen an Tisch ${moveState.targetNr}.</td></tr>`;
    }
    tgtTable.querySelector("tbody").innerHTML = rows;
    updateTotals();
    resetPreview();
}

// --- Totals/Hinweis ---

function updateTotals() {
    const { el, srcTable, tgtTable, tgtSelect, totalLR, totalRL, hint } = refs();

    let lr = 0;
    srcTable.querySelectorAll("tbody tr").forEach(tr => {
        const check = tr.querySelector(".mm-src-check");
        const amt = tr.querySelector(".mm-src-amt");
        if (check && check.checked && !check.disabled && amt) {
            const v = parseInt(amt.value);
            const mx = parseInt(amt.getAttribute("max"));
            if (Number.isInteger(v) && v >= 1 && v <= mx) lr += v;
        }
    });
    if (totalLR) totalLR.textContent = lr;

    let rl = 0;
    if (moveState.mode === "swap") {
        tgtTable.querySelectorAll("tbody tr").forEach(tr => {
            const check = tr.querySelector(".mm-tgt-check");
            const amt = tr.querySelector(".mm-tgt-amt");
            if (check && check.checked && !check.disabled && amt && !amt.disabled) {
                const v = parseInt(amt.value);
                const mx = parseInt(amt.getAttribute("max"));
                if (Number.isInteger(v) && v >= 1 && v <= mx) rl += v;
            }
        });
    }
    if (totalRL) totalRL.textContent = rl;

    if (el) el.classList.toggle("modal--swap", moveState.mode === "swap");
    if (hint) {
        if (moveState.mode === "swap") {
            hint.textContent = "Modus „Tauschen“: Beide Seiten dürfen danach nicht überbucht sein.";
        } else {
            const targetNr = parseInt(tgtSelect && tgtSelect.value);
            const free = Number.isInteger(targetNr) ? (getSeatsByTableNumber(targetNr) || 0) : "—";
            hint.textContent = `Modus „Verschieben“: Ziel-Tisch braucht genügend freie Plätze (aktuell frei: ${free}).`;
        }
    }

    console.log("[MODAL] Totals:", { lr, rl, mode: moveState.mode });
    return { lr, rl };
}

// --- Auswahl aus UI lesen ---

function collectSelections() {
    const { srcTable, tgtTable } = refs();
    const srcSel = [];
    const srcList = reservationsByTable[moveState.sourceNr] || [];
    const srcById = Object.fromEntries(srcList.map(r => [r.id, r]));

    srcTable.querySelectorAll("tbody tr").forEach(tr => {
        const id = tr.getAttribute("data-id");
        const rec = srcById[id];
        if (!rec || rec.sold) return; // SOLD: nie auswählen
        const check = tr.querySelector(".mm-src-check");
        const amtEl = tr.querySelector(".mm-src-amt");
        if (check && check.checked && !check.disabled) {
            const amt = parseInt(amtEl.value), mx = parseInt(amtEl.getAttribute("max"));
            if (Number.isInteger(amt) && amt >= 1 && amt <= mx) srcSel.push({ id, amount: amt });
        }
    });

    const tgtSel = [];
    if (moveState.mode === "swap") {
        const tgtList = reservationsByTable[moveState.targetNr] || [];
        const tgtById = Object.fromEntries(tgtList.map(r => [r.id, r]));
        tgtTable.querySelectorAll("tbody tr").forEach(tr => {
            const id = tr.getAttribute("data-id");
            const rec = tgtById[id];
            if (!rec || rec.sold) return; // SOLD: nie auswählen
            const check = tr.querySelector(".mm-tgt-check");
            const amtEl = tr.querySelector(".mm-tgt-amt");
            if (check && check.checked && !check.disabled && amtEl && !amtEl.disabled) {
                const amt = parseInt(amtEl.value), mx = parseInt(amtEl.getAttribute("max"));
                if (Number.isInteger(amt) && amt >= 1 && amt <= mx) tgtSel.push({ id, amount: amt });
            }
        });
    }
    return { srcSel, tgtSel };
}

// --- Simulation/Preview (ohne echte Daten zu verändern) ---

function deepCloneList(list){ return list.map(r => ({...r})); }

function mergeInto(list, rec, amount) {
    let idx = list.findIndex(x => x.bookingId === rec.bookingId && x.name === rec.name);
    if (idx >= 0) {
        list[idx].cards += amount;
        list[idx].ts = new Date().toISOString();
    } else {
        list.push({ id: uid(), bookingId: rec.bookingId, name: rec.name, cards: amount, notes: rec.notes || "", ts: new Date().toISOString(), sold: !!rec.sold });
    }
}

function simulateLists(fromNr, toNr, srcSel, tgtSel) {
    // Start: Kopien der beiden Listen
    const srcStart = deepCloneList(reservationsByTable[fromNr] || []);
    const tgtStart = deepCloneList(reservationsByTable[toNr]   || []);

    const srcById = Object.fromEntries(srcStart.map(r => [r.id, r]));
    const tgtById = Object.fromEntries(tgtStart.map(r => [r.id, r]));

    // Quelle -> Ziel
    srcSel.forEach(sel => {
        const rec = srcById[sel.id]; if (!rec) return;
        const moveAmt = Math.min(sel.amount, rec.cards);
        rec.cards -= moveAmt;
        if (moveAmt > 0) mergeInto(tgtStart, rec, moveAmt);
    });
    // Purge 0
    for (let i = srcStart.length - 1; i >= 0; i--) if (srcStart[i].cards <= 0) srcStart.splice(i, 1);

    // Ziel -> Quelle (Swap)
    tgtSel.forEach(sel => {
        const rec = tgtById[sel.id]; if (!rec) return;
        const moveAmt = Math.min(sel.amount, rec.cards);
        rec.cards -= moveAmt;
        if (moveAmt > 0) mergeInto(srcStart, rec, moveAmt);
    });
    for (let i = tgtStart.length - 1; i >= 0; i--) if (tgtStart[i].cards <= 0) tgtStart.splice(i, 1);

    return { srcAfter: srcStart, tgtAfter: tgtStart };
}

function buildSplitInfoTextFromAll(afterSrc, afterTgt, fromNr, toNr, bookingId, currentTable) {
    // Geht über alle Tische, ersetzt fromNr/toNr mit den simulierten Listen
    const parts = [];
    for (const key of Object.keys(reservationsByTable)) {
        const tn = parseInt(key, 10);
        const list = (tn === fromNr) ? afterSrc : (tn === toNr ? afterTgt : reservationsByTable[tn]);
        if (!Array.isArray(list) || tn === currentTable) continue;
        for (const r of list) if (r.bookingId === bookingId) parts.push(`${tableLabel(tn)} (${r.cards})`);
    }
    // Falls ein Tisch bisher keine Liste hatte, aber durch Simulation entstanden:
    if (!reservationsByTable[fromNr] && fromNr !== currentTable) {
        for (const r of afterSrc) if (r.bookingId === bookingId) parts.push(`${tableLabel(fromNr)} (${r.cards})`);
    }
    if (!reservationsByTable[toNr] && toNr !== currentTable) {
        for (const r of afterTgt) if (r.bookingId === bookingId) parts.push(`${tableLabel(toNr)} (${r.cards})`);
    }
    return parts.length ? `Weitere Plätze: ${parts.join(", ")}` : "";
}

function renderPreviewReservations(afterSrc, afterTgt, fromNr, toNr) {
    const { prevSrcResTbody, prevTgtResTbody } = refs();

    // Quelle (nachher)
    prevSrcResTbody.innerHTML = afterSrc.length
        ? afterSrc.map(r => {
            const split = buildSplitInfoTextFromAll(afterSrc, afterTgt, fromNr, toNr, r.bookingId, fromNr);
            const notesHtml = noteToHtml(r.notes) + (split ? `<div style="font-size:12px;opacity:.75;">${escapeHtml(split)}</div>` : "");
            const bid = r.bookingId ? String(r.bookingId) : "—";
            const soldClass = r.sold ? ' class="is-sold"' : '';
            return `<tr${soldClass}>
          <td>${escapeHtml(r.name)}<div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div></td>
          <td>${r.cards}</td>
          <td>${notesHtml}</td>
        </tr>`;
        }).join("")
        : `<tr><td colspan="3">Keine Reservierungen an Tisch ${fromNr}.</td></tr>`;

    // Ziel (nachher)
    prevTgtResTbody.innerHTML = afterTgt.length
        ? afterTgt.map(r => {
            const split = buildSplitInfoTextFromAll(afterSrc, afterTgt, fromNr, toNr, r.bookingId, toNr);
            const notesHtml = noteToHtml(r.notes) + (split ? `<div style="font-size:12px;opacity:.75;">${escapeHtml(split)}</div>` : "");
            const bid = r.bookingId ? String(r.bookingId) : "—";
            const soldClass = r.sold ? ' class="is-sold"' : '';
            return `<tr${soldClass}>
          <td>${escapeHtml(r.name)}<div style="font-size:12px;opacity:.7;">Buchung-ID: ${escapeHtml(bid)}</div></td>
          <td>${r.cards}</td>
          <td>${notesHtml}</td>
        </tr>`;
        }).join("")
        : `<tr><td colspan="3">Keine Reservierungen an Tisch ${toNr}.</td></tr>`;
}

// --- Preview-Button ---

function runPreview() {
    const { prevWrap, prevOk, prevTgtErr, prevSrcOk, prevSrcErr,
        prevSrcNr, prevSrcFreeOld, prevSrcFreeNew,
        prevTgtNr, prevTgtFreeOld, prevTgtFreeNew,
        btnApply } = refs();

    if (!Number.isInteger(moveState.targetNr)) return alert("Bitte Ziel-Tisch auswählen.");

    const { lr, rl } = updateTotals();
    const { srcSel, tgtSel } = collectSelections();

    const fromNr = moveState.sourceNr;
    const toNr   = moveState.targetNr;

    // freie Plätze alt/neu berechnen
    const srcFreeOld = getSeatsByTableNumber(fromNr) || 0;
    const tgtFreeOld = getSeatsByTableNumber(toNr) || 0;
    const srcFreeNew = srcFreeOld + lr - rl;
    const tgtFreeNew = tgtFreeOld - lr + rl;

    // Reservierungslisten simulieren (nachher)
    const { srcAfter, tgtAfter } = simulateLists(fromNr, toNr, srcSel, tgtSel);

    // Header/Badges
    prevSrcNr.textContent = fromNr;
    prevTgtNr.textContent = toNr;
    prevSrcFreeOld.textContent = srcFreeOld;
    prevTgtFreeOld.textContent = tgtFreeOld;
    prevSrcFreeNew.textContent = srcFreeNew;
    prevTgtFreeNew.textContent = tgtFreeNew;

    const srcOk = (srcFreeNew >= 0);
    const tgtOk = (tgtFreeNew >= 0);

    prevSrcOk.style.display  = srcOk ? "inline-block" : "none";
    prevSrcErr.style.display = srcOk ? "none" : "inline-block";
    prevOk.style.display     = tgtOk ? "inline-block" : "none";
    prevTgtErr.style.display = tgtOk ? "none" : "inline-block";

    // Tabellen: neue Reservierungen pro Tisch
    renderPreviewReservations(srcAfter, tgtAfter, fromNr, toNr);

    // Sichtbarkeit + Button-State
    prevWrap.style.display = "grid";
    moveState.previewOk = (srcOk && tgtOk);        // blockiert Ausführen, wenn eine Seite < 0
    btnApply.disabled = !moveState.previewOk;

    console.log("[MODAL/PREVIEW]", { fromNr, toNr, lr, rl, srcFreeOld, srcFreeNew, tgtFreeOld, tgtFreeNew, srcOk, tgtOk, srcSel, tgtSel });
}

// --- Anwenden ---

function applyMoveOrSwap() {
    if (!moveState.previewOk) return alert("Bitte zuerst erfolgreich prüfen.");
    const { srcTable } = refs();
    const targetNr = moveState.targetNr;

    // Auswahl erneut lesen (soll dem entsprechen, was geprüft wurde)
    const { srcSel, tgtSel } = collectSelections();

    const sumLR = srcSel.reduce((s, x) => s + x.amount, 0);
    const sumRL = tgtSel.reduce((s, x) => s + x.amount, 0);

    const fromNr = moveState.sourceNr;
    ensureBucket(fromNr); ensureBucket(targetNr);
    const srcList = reservationsByTable[fromNr];
    const tgtList = reservationsByTable[targetNr];

    const srcById = Object.fromEntries(srcList.map(r => [r.id, r]));
    const tgtById = Object.fromEntries(tgtList.map(r => [r.id, r]));

    // Quelle -> Ziel
    srcSel.forEach(sel => {
        const rec = srcById[sel.id]; if (!rec) return;
        if (rec.sold) return; // Hard guard
        const moveAmt = Math.min(sel.amount, rec.cards);
        rec.cards -= moveAmt;
        if (moveAmt > 0) {
            let idx = tgtList.findIndex(r => r.bookingId === rec.bookingId && r.name === rec.name);
            if (idx >= 0) { tgtList[idx].cards += moveAmt; tgtList[idx].ts = new Date().toISOString(); }
            else { tgtList.push({ id: uid(), bookingId: rec.bookingId, name: rec.name, cards: moveAmt, notes: rec.notes || "", ts: new Date().toISOString(), sold: !!rec.sold }); }
        }
    });
    for (let i = srcList.length - 1; i >= 0; i--) if (srcList[i].cards <= 0) srcList.splice(i, 1);

    // Ziel -> Quelle (Swap)
    if (moveState.mode === "swap") {
        tgtSel.forEach(sel => {
            const rec = tgtById[sel.id]; if (!rec) return;
            if (rec.sold) return; // Hard guard
            const moveAmt = Math.min(sel.amount, rec.cards);
            rec.cards -= moveAmt;
            if (moveAmt > 0) {
                let idx = srcList.findIndex(r => r.bookingId === rec.bookingId && r.name === rec.name);
                if (idx >= 0) { srcList[idx].cards += moveAmt; srcList[idx].ts = new Date().toISOString(); }
                else { srcList.push({ id: uid(), bookingId: rec.bookingId, name: rec.name, cards: moveAmt, notes: rec.notes || "", ts: new Date().toISOString(), sold: !!rec.sold }); }
            }
        });
        for (let i = tgtList.length - 1; i >= 0; i--) if (tgtList[i].cards <= 0) tgtList.splice(i, 1);
    }

    // Plätze verrechnen (beide Seiten >= 0 bereits geprüft)
    const newFrom = (getSeatsByTableNumber(fromNr) || 0) + sumLR - sumRL;
    const newTo   = (getSeatsByTableNumber(targetNr) || 0) - sumLR + sumRL;
    setSeatsByTableNumber(fromNr, newFrom);
    setSeatsByTableNumber(targetNr, newTo);

    printTischArray(tisch);
    setSelectedTableNr(targetNr);
    markEventStateDirty(moveState.mode === "swap" ? "reservation-swap" : "reservation-move");
    closeModal();
}

// --- Events/Öffnen/Schließen ---

function wireModalEvents() {
    const { el, btnClose, btnCancel, btnApply, btnCheck, tgtSelect, srcTable, tgtTable } = refs();
    if (!el) return;

    btnClose?.addEventListener("click", closeModal);
    btnCancel?.addEventListener("click", closeModal);
    btnApply?.addEventListener("click", applyMoveOrSwap);
    btnCheck?.addEventListener("click", runPreview);

    el.addEventListener("change", e => {
        const radio = e.target.closest('input[name="moveMode"]');
        if (radio) {
            moveState.mode = radio.value;
            el.classList.toggle("modal--swap", moveState.mode === "swap");
            renderTargetTable();
            updateTotals();
            resetPreview();
            console.log("[MODAL] Modus:", moveState.mode);
        }
    });

    tgtSelect?.addEventListener("change", renderTargetTable);

    srcTable?.addEventListener("change", e => {
        const tr = e.target.closest("tr[data-id]"); if (!tr) return;
        if (e.target.classList.contains("mm-src-check")) {
            const checkbox = e.target;
            const amt = tr.querySelector(".mm-src-amt");
            const isDisabled = checkbox.disabled;
            if (!isDisabled) amt.disabled = !checkbox.checked;
            updateTotals(); resetPreview();
        }
    });
    srcTable?.addEventListener("input", e => { if (e.target.classList.contains("mm-src-amt")) { updateTotals(); resetPreview(); } });

    tgtTable?.addEventListener("change", e => {
        if (moveState.mode !== "swap") return;
        const tr = e.target.closest("tr[data-id]"); if (!tr) return;
        if (e.target.classList.contains("mm-tgt-check")) {
            const checkbox = e.target;
            const amt = tr.querySelector(".mm-tgt-amt");
            const isDisabled = checkbox.disabled;
            if (!isDisabled) amt.disabled = !checkbox.checked;
            updateTotals(); resetPreview();
        }
    });
    tgtTable?.addEventListener("input", e => { if (e.target.classList.contains("mm-tgt-amt")) { updateTotals(); resetPreview(); } });

    el.addEventListener("click", e => {
        if (e.target === el || e.target.classList.contains("modal__backdrop")) closeModal();
    });
    document.addEventListener("keydown", e => { if (!el.classList.contains("hidden") && e.key === "Escape") closeModal(); });
}

function openModal(sourceNr, preselectId) {
    ensureMoveModal();
    const { el, srcNr, tgtSelect } = refs();

    moveState = { mode: "move", sourceNr, targetNr: null, preselectId, previewOk: false };
    el.classList.remove("modal--swap");

    srcNr.textContent = sourceNr;

    // Ziel-Select
    tgtSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = ""; opt0.textContent = "Bitte Ziel-Tisch wählen";
    tgtSelect.appendChild(opt0);

    sortTischArrayNr(tisch);
    for (let i = 1; i < tisch.length; i++) {
        const [nr, plaetze] = tisch[i];
        if (nr === sourceNr) continue;
        const opt = document.createElement("option");
        opt.value = nr;
        opt.textContent = `Tisch ${nr} (frei: ${plaetze})`;
        tgtSelect.appendChild(opt);
    }

    const optSteh = document.createElement("option");
    optSteh.value = 0;
    optSteh.textContent = `Stehplätze: ${tisch[0][1]}`;
    tgtSelect.appendChild(optSteh);

    renderSourceTable();
    renderTargetTable();
    updateTotals();
    resetPreview();

    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");

    if (!modalWired) { wireModalEvents(); modalWired = true; }
}

function closeModal() {
    const { el } = refs();
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
    console.log("[MODAL] geschlossen.");
}

export function openMoveModal(sourceNr, preselectId) {
    openModal(sourceNr, preselectId);
}
