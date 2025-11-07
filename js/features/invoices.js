import { tableLabel } from "../core/state.js";
import { parseEventName } from "../core/events.js";

const euroFormatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
});

const PAYMENT_METHODS = new Map([
    ["cash", "Bar"],
    ["card", "Karte"],
]);

const invoices = [];
const invoiceListeners = new Set();

function notifyInvoiceChange(reason, invoice = null) {
    for (const cb of invoiceListeners) {
        try {
            cb({ reason, invoice, invoices: getInvoices() });
        } catch (err) {
            console.error("[INVOICES] Listener error", err);
        }
    }
}

export function onInvoicesChange(cb) {
    if (typeof cb !== "function") return () => {};
    invoiceListeners.add(cb);
    return () => invoiceListeners.delete(cb);
}

export function getInvoices() {
    return invoices.slice();
}

export function getLatestInvoice() {
    return invoices.length ? invoices[invoices.length - 1] : null;
}

function sanitizeText(input) {
    if (input == null) return "";
    return String(input)
        .replace(/[\r\n]+/g, " ")
        .replace(/ß/g, "ss")
        .replace(/Ä/g, "Ae")
        .replace(/Ö/g, "Oe")
        .replace(/Ü/g, "Ue")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\u0020-\u007E]+/g, "")
        .trim();
}

function escapePdfText(value) {
    return sanitizeText(value)
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
}

function formatEuro(value) {
    return euroFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatDisplayDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
        return "";
    }
    return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function formatIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
        return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseEventDateLabel(eventName) {
    const parsed = parseEventName(eventName || "");
    if (!parsed?.date) return "";
    const [year, month, day] = parsed.date.split("-").map(part => parseInt(part, 10));
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return "";
    }
    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${String(year).padStart(4, "0")}`;
}

function approximateTextWidth(text, size) {
    const safe = sanitizeText(text);
    return safe.length * size * 0.52;
}

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode(...slice);
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function encodeSharePayload(payload) {
    const json = JSON.stringify(payload);
    const encoded = new TextEncoder().encode(json);
    let base64 = bytesToBase64(encoded);
    base64 = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return base64;
}

function decodeSharePayload(token) {
    if (typeof token !== "string" || !token) return null;
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (padded.length % 4)) % 4;
    const base64 = padded + "=".repeat(padLength);
    try {
        const bytes = base64ToBytes(base64);
        const json = new TextDecoder().decode(bytes);
        return JSON.parse(json);
    } catch (err) {
        console.warn("[INVOICES] Share-Payload konnte nicht dekodiert werden:", err);
        return null;
    }
}

function createPdfObjects(contentStream) {
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(contentStream);
    const length = contentBytes.length;

    const width = 595.28;
    const height = 841.89;

    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
        `<< /Length ${length} >>\nstream\n${contentStream}endstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ];

    const chunks = [];
    const offsets = [0];
    let offset = 0;

    function append(str) {
        const bytes = encoder.encode(str);
        chunks.push(bytes);
        offset += bytes.length;
    }

    append("%PDF-1.4\n");

    objects.forEach((obj, index) => {
        offsets.push(offset);
        append(`${index + 1} 0 obj\n`);
        append(obj);
        append("\nendobj\n");
    });

    const xrefOffset = offset;

    append(`xref\n0 ${objects.length + 1}\n`);
    append("0000000000 65535 f \n");
    for (let i = 1; i < offsets.length; i += 1) {
        append(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    append(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`);
    append(`startxref\n${xrefOffset}\n%%EOF`);

    const totalLength = chunks.reduce((sum, bytes) => sum + bytes.length, 0);
    const output = new Uint8Array(totalLength);
    let position = 0;
    for (const bytes of chunks) {
        output.set(bytes, position);
        position += bytes.length;
    }

    return output;
}

function buildPdfContent({
    createdAt,
    invoiceNumber,
    lines,
    totalAmount,
    totalCards,
    paymentMethod,
}) {
    const margin = 48;
    const width = 595.28;
    const height = 841.89;
    const innerWidth = width - margin * 2;

    const lineHeight = 16;
    const detailLineHeight = 12;

    const content = [];
    let cursorY = height - margin;

    function writeText(text, x, y, { font = "F1", size = 12, align = "left" } = {}) {
        const safe = escapePdfText(text);
        let posX = x;
        if (align === "right") {
            const approx = approximateTextWidth(safe, size);
            posX = x - approx;
        }
        content.push("BT");
        content.push(`/${font} ${size.toFixed(2)} Tf`);
        content.push(`1 0 0 1 ${posX.toFixed(2)} ${y.toFixed(2)} Tm`);
        content.push(`(${safe}) Tj`);
        content.push("ET");
    }

    function addLine(text, options = {}) {
        writeText(text, margin, cursorY, options);
        cursorY -= lineHeight;
    }

    writeText("Sandersdorfer Karnevalsverein e. V.", margin, cursorY, { font: "F2", size: 16 });
    cursorY -= lineHeight * 1.5;
    writeText("Rechnung", margin, cursorY, { font: "F2", size: 22 });
    cursorY -= lineHeight * 1.8;

    const displayDate = formatDisplayDate(createdAt);
    addLine(`Datum: ${displayDate}`);
    addLine(`Rechnungsnummer: ${invoiceNumber}`);

    cursorY -= lineHeight * 0.25;
    writeText("Rechnungsadresse:", margin, cursorY, { font: "F2", size: 12 });
    cursorY -= lineHeight;
    addLine("Sandersdorfer Karnevalsverein e. V.", { size: 12 });
    addLine("Am Sportzentrum 19", { size: 12 });
    addLine("06792 Sandersdorf-Brehna", { size: 12 });

    cursorY -= lineHeight * 0.25;
    writeText("Positionen", margin, cursorY, { font: "F2", size: 12 });
    cursorY -= lineHeight;

    const col1 = margin;
    const colQty = margin + innerWidth * 0.55;
    const colUnit = margin + innerWidth * 0.75;
    const colTotal = margin + innerWidth * 0.92;

    writeText("Beschreibung", col1, cursorY, { font: "F2", size: 10 });
    writeText("Karten", colQty, cursorY, { font: "F2", size: 10, align: "right" });
    writeText("Einzelpreis", colUnit, cursorY, { font: "F2", size: 10, align: "right" });
    writeText("Gesamt", colTotal, cursorY, { font: "F2", size: 10, align: "right" });
    cursorY -= lineHeight * 0.8;

    for (const line of lines) {
        const { name, detail, quantity, unitPriceFormatted, totalFormatted } = line;
        writeText(name, col1, cursorY, { size: 12 });
        writeText(String(quantity), colQty, cursorY, { size: 12, align: "right" });
        writeText(unitPriceFormatted, colUnit, cursorY, { size: 12, align: "right" });
        writeText(totalFormatted, colTotal, cursorY, { size: 12, align: "right" });
        cursorY -= detailLineHeight;
        if (detail) {
            writeText(detail, col1 + 6, cursorY, { size: 9 });
            cursorY -= lineHeight * 0.7;
        } else {
            cursorY -= lineHeight * 0.5;
        }
    }

    cursorY -= lineHeight * 0.5;
    writeText(`Gesamt Karten: ${totalCards}`, margin, cursorY, { font: "F2", size: 12 });
    cursorY -= lineHeight;
    writeText(`Gesamtbetrag: ${formatEuro(totalAmount)}`, margin, cursorY, { font: "F2", size: 12 });
    cursorY -= lineHeight;
    const paymentLabel = PAYMENT_METHODS.get(paymentMethod) || paymentMethod || "Bar";
    writeText(`Zahlart: ${paymentLabel}`, margin, cursorY, { size: 12 });
    cursorY -= lineHeight * 1.2;
    writeText("Hinweis: Diese Rechnung gilt nicht als Eintrittskarte.", margin, cursorY, { size: 11 });

    return content.join("\n") + "\n";
}

function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i += 1) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xEDB88320 & mask);
        }
    }
    return (crc ^ -1) >>> 0;
}

function numberToUint16LE(value) {
    const buffer = new Uint8Array(2);
    buffer[0] = value & 0xFF;
    buffer[1] = (value >>> 8) & 0xFF;
    return buffer;
}

function numberToUint32LE(value) {
    const buffer = new Uint8Array(4);
    buffer[0] = value & 0xFF;
    buffer[1] = (value >>> 8) & 0xFF;
    buffer[2] = (value >>> 16) & 0xFF;
    buffer[3] = (value >>> 24) & 0xFF;
    return buffer;
}

function buildZipFile(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const centralRecords = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        const data = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array();
        const crc = crc32(data);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        let pos = 0;
        localHeader.set(numberToUint32LE(0x04034b50), pos); pos += 4;
        localHeader.set(numberToUint16LE(20), pos); pos += 2;
        localHeader.set(numberToUint16LE(0), pos); pos += 2;
        localHeader.set(numberToUint16LE(0), pos); pos += 2;
        localHeader.set(numberToUint16LE(0), pos); pos += 2;
        localHeader.set(numberToUint16LE(0), pos); pos += 2;
        localHeader.set(numberToUint32LE(crc), pos); pos += 4;
        localHeader.set(numberToUint32LE(data.length), pos); pos += 4;
        localHeader.set(numberToUint32LE(data.length), pos); pos += 4;
        localHeader.set(numberToUint16LE(nameBytes.length), pos); pos += 2;
        localHeader.set(numberToUint16LE(0), pos); pos += 2;
        localHeader.set(nameBytes, pos);

        chunks.push(localHeader);
        chunks.push(data);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        pos = 0;
        centralHeader.set(numberToUint32LE(0x02014b50), pos); pos += 4;
        centralHeader.set(numberToUint16LE(20), pos); pos += 2;
        centralHeader.set(numberToUint16LE(20), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint32LE(crc), pos); pos += 4;
        centralHeader.set(numberToUint32LE(data.length), pos); pos += 4;
        centralHeader.set(numberToUint32LE(data.length), pos); pos += 4;
        centralHeader.set(numberToUint16LE(nameBytes.length), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint16LE(0), pos); pos += 2;
        centralHeader.set(numberToUint32LE(0), pos); pos += 4;
        centralHeader.set(numberToUint32LE(offset), pos); pos += 4;
        centralHeader.set(nameBytes, pos);

        centralRecords.push(centralHeader);
        offset += localHeader.length + data.length;
    }

    const centralOffset = offset;
    for (const record of centralRecords) {
        chunks.push(record);
        offset += record.length;
    }

    const endRecord = new Uint8Array(22);
    let pos = 0;
    endRecord.set(numberToUint32LE(0x06054b50), pos); pos += 4;
    endRecord.set(numberToUint16LE(0), pos); pos += 2;
    endRecord.set(numberToUint16LE(0), pos); pos += 2;
    endRecord.set(numberToUint16LE(files.length), pos); pos += 2;
    endRecord.set(numberToUint16LE(files.length), pos); pos += 2;
    const centralSize = offset - centralOffset;
    endRecord.set(numberToUint32LE(centralSize), pos); pos += 4;
    endRecord.set(numberToUint32LE(centralOffset), pos); pos += 4;
    endRecord.set(numberToUint16LE(0), pos);

    chunks.push(endRecord);

    const totalLength = chunks.reduce((sum, part) => sum + part.length, 0);
    const zipBytes = new Uint8Array(totalLength);
    let pointer = 0;
    for (const part of chunks) {
        zipBytes.set(part, pointer);
        pointer += part.length;
    }
    return zipBytes;
}

function buildInvoiceLines(entries) {
    const lines = [];
    let totalAmount = 0;
    let totalCards = 0;

    for (const entry of entries) {
        const reservation = entry?.reservation;
        if (!reservation) continue;
        const cards = Number.isFinite(reservation?.cards)
            ? reservation.cards
            : Number.parseInt(reservation?.cards, 10) || 0;
        if (!cards) continue;
        const unitPrice = Number.isFinite(entry?.cardPrice) ? entry.cardPrice : 0;
        const amount = cards * unitPrice;
        totalAmount += amount;
        totalCards += cards;

        const name = reservation?.name ? reservation.name.trim() : "Unbekannt";
        const eventLabel = entry?.eventDisplayName?.trim() || entry?.eventName?.trim() || "Veranstaltung";
        const eventDate = parseEventDateLabel(entry?.eventName);
        const tableText = tableLabel(entry?.tableNr);
        const detailParts = [eventLabel];
        if (eventDate) detailParts.push(eventDate);
        if (tableText) detailParts.push(tableText);
        const detail = detailParts.join(" · ");

        lines.push({
            id: reservation.id,
            name,
            detail,
            quantity: cards,
            unitPrice,
            unitPriceFormatted: formatEuro(unitPrice),
            totalFormatted: formatEuro(amount),
            amount,
        });
    }

    return {
        lines,
        totalAmount,
        totalCards,
    };
}

export function buildCartSummary(entries) {
    const { lines, totalAmount, totalCards } = buildInvoiceLines(entries);
    return {
        lines: lines.map(line => ({
            id: line.id,
            name: line.name,
            detail: line.detail,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitPriceFormatted: line.unitPriceFormatted,
            totalFormatted: line.totalFormatted,
        })),
        totalAmount,
        totalCards,
        currency: "EUR",
    };
}

export async function createInvoiceFromCart(entries, { paymentMethod = "cash" } = {}) {
    const createdAt = new Date();
    const isoDate = formatIsoDate(createdAt).replace(/-/g, "");
    const timePart = `${String(createdAt.getHours()).padStart(2, "0")}${String(createdAt.getMinutes()).padStart(2, "0")}${String(createdAt.getSeconds()).padStart(2, "0")}`;
    const invoiceNumber = `SKV-${isoDate}-${timePart}`;

    const summary = buildInvoiceLines(entries);
    if (!summary.lines.length) {
        throw new Error("Keine gültigen Positionen für die Rechnung");
    }

    const sharePayload = {
        invoiceNumber,
        createdAt: createdAt.toISOString(),
        paymentMethod,
        paymentLabel: getPaymentLabel(paymentMethod),
        totalAmount: summary.totalAmount,
        totalCards: summary.totalCards,
        currency: "EUR",
        lines: summary.lines.map(line => ({
            id: line.id,
            name: line.name,
            detail: line.detail,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitPriceFormatted: line.unitPriceFormatted,
            totalFormatted: line.totalFormatted,
        })),
    };
    const shareToken = encodeSharePayload(sharePayload);

    const contentStream = buildPdfContent({
        createdAt,
        invoiceNumber,
        lines: summary.lines,
        totalAmount: summary.totalAmount,
        totalCards: summary.totalCards,
        paymentMethod,
    });

    const pdfBytes = createPdfObjects(contentStream);
    const base64 = bytesToBase64(pdfBytes);
    const dataUrl = `data:application/pdf;base64,${base64}`;
    const fileName = `Rechnung_${invoiceNumber}.pdf`;

    const invoice = {
        id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: createdAt.toISOString(),
        invoiceNumber,
        paymentMethod,
        totalAmount: summary.totalAmount,
        totalCards: summary.totalCards,
        currency: "EUR",
        lines: summary.lines,
        fileName,
        bytes: pdfBytes,
        base64,
        dataUrl,
        shareToken,
        sharePayload,
    };

    if (typeof window !== "undefined" && window.location) {
        try {
            const baseUrl = new URL(window.location.href);
            baseUrl.hash = "";
            baseUrl.search = "";
            const parts = baseUrl.pathname.split("/");
            if (parts.length) {
                parts[parts.length - 1] = "invoice.html";
                baseUrl.pathname = parts.join("/");
            }
            invoice.shareUrl = `${baseUrl.href.replace(/#.*$/, "")}#${shareToken}`;
        } catch (err) {
            console.warn("[INVOICES] Konnte Share-URL nicht berechnen:", err);
        }
    }
    if (!invoice.shareUrl) {
        invoice.shareUrl = `invoice.html#${shareToken}`;
    }

    invoices.push(invoice);
    notifyInvoiceChange("created", invoice);

    return invoice;
}

export function downloadInvoicesZip() {
    if (!invoices.length) {
        alert("Es wurden noch keine Rechnungen erstellt.");
        return;
    }

    const files = invoices.map(invoice => ({
        name: invoice.fileName,
        bytes: invoice.bytes,
    }));
    const zipBytes = buildZipFile(files);
    const blob = new Blob([zipBytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = new Date();
    const stamp = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}_${String(timestamp.getHours()).padStart(2, "0")}${String(timestamp.getMinutes()).padStart(2, "0")}`;
    link.download = `SKV_Rechnungen_${stamp}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function getPaymentLabel(method) {
    return PAYMENT_METHODS.get(method) || method || "Bar";
}

export function decodeInvoiceShareToken(token) {
    return decodeSharePayload(token);
}

export function buildPdfFromPayload(payload) {
    if (!payload) return null;
    const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();
    const invoiceNumber = payload.invoiceNumber || "SKV-Rechnung";
    const lines = Array.isArray(payload.lines) ? payload.lines.map(line => {
        const quantity = Number.parseInt(line?.quantity, 10) || 0;
        const unitPrice = Number.isFinite(line?.unitPrice) ? line.unitPrice : 0;
        return {
            name: line?.name || "Position",
            detail: line?.detail || "",
            quantity,
            unitPriceFormatted: line?.unitPriceFormatted || formatEuro(unitPrice),
            totalFormatted: line?.totalFormatted || formatEuro(unitPrice * quantity),
        };
    }) : [];
    const totalAmount = Number.isFinite(payload.totalAmount) ? payload.totalAmount : 0;
    const totalCards = Number.isFinite(payload.totalCards) ? payload.totalCards : 0;
    const paymentMethod = payload.paymentMethod || "cash";

    const contentStream = buildPdfContent({
        createdAt,
        invoiceNumber,
        lines,
        totalAmount,
        totalCards,
        paymentMethod,
    });

    return createPdfObjects(contentStream);
}
