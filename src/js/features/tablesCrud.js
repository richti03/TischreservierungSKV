import { tisch, findIndexByTableNumber } from "../core/state.js";
import { printTischArray, setSelectedTableNr } from "../ui/tableView.js";

export function tischHinzufuegen() {
    const tnr = parseInt(prompt("Neue Tischnummer eingeben:"));
    if (!Number.isInteger(tnr) || tnr <= 0) return alert("Ungültige Tischnummer.");

    const seats = parseInt(prompt(`Sitzplatzanzahl für Tisch ${tnr} eingeben:`));
    if (!Number.isInteger(seats) || seats < 0) return alert("Ungültige Sitzplatzanzahl.");

    const idx = findIndexByTableNumber(tnr);
    if (idx >= 0) {
        if (!confirm(`Tisch ${tnr} existiert bereits. Plätze auf ${seats} setzen?`)) return;
        tisch[idx][1] = seats;
    } else {
        tisch.push([tnr, seats]);
    }
    printTischArray(tisch);
    setSelectedTableNr(tnr);
}

export function tischEntfernen() {
    const tnr = parseInt(prompt("Welche Tischnummer soll entfernt werden?"));
    if (!Number.isInteger(tnr)) return alert("Ungültige Tischnummer.");

    const idx = findIndexByTableNumber(tnr);
    if (idx < 0) return alert(`Tisch ${tnr} wurde nicht gefunden.`);

    if (!confirm(`Tisch ${tnr} wirklich entfernen?`)) return;
    tisch.splice(idx, 1);
    printTischArray(tisch);
}

export function changePlätze() {
    const tnr = parseInt(prompt("Bitte Tischnummer eingeben:"));
    const plaetze = parseInt(prompt("Bitte neue Sitzplatzanzahl eingeben:"));
    if (!Number.isInteger(tnr) || !Number.isInteger(plaetze)) return alert("Bitte gültige Zahlen eingeben.");

    const idx = findIndexByTableNumber(tnr);
    if (idx >= 0) tisch[idx][1] = plaetze; else return alert("Tisch nicht gefunden!");
    printTischArray(tisch);
    setSelectedTableNr(tnr);
}
