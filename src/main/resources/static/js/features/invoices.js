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

const WIN_ANSI_OVERRIDES = new Map([
    [0x20AC, 0x80], // Euro sign
]);

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
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .trim();
}

function escapePdfText(value) {
    const sanitized = sanitizeText(value);
    let output = "";
    for (let i = 0; i < sanitized.length; i += 1) {
        const char = sanitized[i];
        const directCode = char.charCodeAt(0);
        const code = WIN_ANSI_OVERRIDES.get(directCode) ?? directCode;
        if (char === "\\" || char === "(" || char === ")") {
            output += `\\${char}`;
        } else if (code >= 0 && code <= 31) {
            // Control characters are stripped during sanitisation, but guard just in case
            continue;
        } else if (code >= 128 && code <= 255) {
            output += `\\${code.toString(8).padStart(3, "0")}`;
        } else if (code > 255) {
            output += "?";
        } else {
            output += String.fromCharCode(code);
        }
    }
    return output;
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

let cachedLogoAsset = null;
let logoPromise = null;

async function loadLogoImage() {
    if (cachedLogoAsset) {
        return cachedLogoAsset;
    }
    if (logoPromise) {
        return logoPromise;
    }
    if (typeof fetch !== "function") {
        cachedLogoAsset = { bytes: null, width: 0, height: 0 };
        return cachedLogoAsset;
    }

    let logoUrl = "img/SKV-Wappen.png";
    try {
        if (typeof window !== "undefined" && window.location) {
            logoUrl = new URL("img/SKV-Wappen.png", window.location.href).toString();
        }
    } catch (err) {
        console.warn("[INVOICES] Logo-URL konnte nicht bestimmt werden:", err);
    }

    logoPromise = fetch(logoUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.arrayBuffer();
        })
        .then(buffer => {
            const bytes = new Uint8Array(buffer);
            cachedLogoAsset = { bytes, width: 1610, height: 1889 };
            return cachedLogoAsset;
        })
        .catch(err => {
            console.warn("[INVOICES] Logo konnte nicht geladen werden:", err);
            cachedLogoAsset = { bytes: null, width: 0, height: 0 };
            return cachedLogoAsset;
        })
        .finally(() => {
            logoPromise = null;
        });

    return logoPromise;
}

function createPdfObjects(contentStream, { logo = null } = {}) {
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(contentStream);
    const width = 595.28;
    const height = 841.89;
    const hasLogo = Boolean(logo?.bytes?.length && logo?.name);
    const logoObjectNumber = hasLogo ? 7 : null;

    const resources = [`/Font << /F1 5 0 R /F2 6 0 R >>`];
    if (hasLogo && logoObjectNumber) {
        resources.push(`/XObject << /${logo.name} ${logoObjectNumber} 0 R >>`);
    }

    const objects = [
        { type: "text", value: "<< /Type /Catalog /Pages 2 0 R >>" },
        { type: "text", value: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        { type: "text", value: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Contents 4 0 R /Resources << ${resources.join(' ')} >> >>` },
        { type: "stream", data: contentBytes },
        { type: "text", value: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>" },
        { type: "text", value: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>" },
    ];

    if (hasLogo && logoObjectNumber) {
        const dict = `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>`;
        objects.push({ type: "binaryStream", dict, data: logo.bytes });
    }

    const chunks = [];
    const offsets = [0];
    let offset = 0;

    function appendText(str) {
        const bytes = encoder.encode(str);
        chunks.push(bytes);
        offset += bytes.length;
    }

    function appendBinary(bytes) {
        chunks.push(bytes);
        offset += bytes.length;
    }

    appendText("%PDF-1.4\n");

    objects.forEach((obj, index) => {
        offsets.push(offset);
        appendText(`${index + 1} 0 obj\n`);
        if (obj.type === "text") {
            appendText(`${obj.value}\nendobj\n`);
        } else if (obj.type === "stream") {
            appendText(`<< /Length ${obj.data.length} >>\nstream\n`);
            appendBinary(obj.data);
            appendText("\nendstream\nendobj\n");
        } else if (obj.type === "binaryStream") {
            appendText(`${obj.dict}\nstream\n`);
            appendBinary(obj.data);
            appendText("\nendstream\nendobj\n");
        }
    });

    const xrefOffset = offset;

    appendText(`xref\n0 ${objects.length + 1}\n`);
    appendText("0000000000 65535 f \n");
    for (let i = 1; i < offsets.length; i += 1) {
        appendText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    appendText(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`);
    appendText(`startxref\n${xrefOffset}\n%%EOF`);

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
    paymentLabel,
}, { logo = null } = {}) {
    const margin = 48;
    const width = 595.28;
    const height = 841.89;
    const contentWidth = width - margin * 2;
    const headerHeight = 120;
    const baseLine = 18;
    const detailLine = 12;

    function hexToRgbString(hex) {
        const clean = hex.replace('#', '');
        const value = Number.parseInt(clean, 16);
        const r = ((value >> 16) & 0xff) / 255;
        const g = ((value >> 8) & 0xff) / 255;
        const b = (value & 0xff) / 255;
        return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
    }

    const COLORS = {
        page: hexToRgbString('#f8faff'),
        primary: hexToRgbString('#4169e1'),
        primaryDark: hexToRgbString('#1f3f94'),
        text: hexToRgbString('#1f2937'),
        muted: hexToRgbString('#64748b'),
        line: hexToRgbString('#d7e3ff'),
        white: '1 1 1',
        panel: hexToRgbString('#eef3ff'),
    };

    const content = [];

    function writeText(text, x, y, { font = 'F1', size = 12, align = 'left', color = COLORS.text } = {}) {
        const clean = sanitizeText(text);
        const safe = escapePdfText(clean);
        let posX = x;
        if (align === 'right') {
            const approx = approximateTextWidth(clean, size);
            posX = x - approx;
        } else if (align === 'center') {
            const approx = approximateTextWidth(clean, size);
            posX = x - approx / 2;
        }
        content.push('BT');
        content.push(`/${font} ${size.toFixed(2)} Tf`);
        content.push(`${color} rg`);
        content.push(`1 0 0 1 ${posX.toFixed(2)} ${y.toFixed(2)} Tm`);
        content.push(`(${safe}) Tj`);
        content.push('ET');
    }

    function fillRect(x, y, w, h, color) {
        content.push('q');
        content.push(`${color} rg`);
        content.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
        content.push('f');
        content.push('Q');
    }

    function drawLine(x1, y1, x2, y2, color, widthValue = 1) {
        content.push('q');
        content.push(`${color} RG`);
        content.push(`${widthValue.toFixed(2)} w`);
        content.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m`);
        content.push(`${x2.toFixed(2)} ${y2.toFixed(2)} l`);
        content.push('S');
        content.push('Q');
    }

    function drawImage(name, x, y, drawWidth, drawHeight) {
        content.push('q');
        content.push(`${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`);
        content.push(`/${name} Do`);
        content.push('Q');
    }

    const headerBottom = height - headerHeight;
    fillRect(0, 0, width, height, COLORS.page);
    fillRect(0, headerBottom, width, headerHeight, COLORS.primary);
    drawLine(0, headerBottom, width, headerBottom, COLORS.primaryDark, 2);

    const hasLogo = Boolean(logo?.name && logo?.width && logo?.height);
    if (hasLogo) {
        const aspect = logo.height > 0 ? logo.height / logo.width : 1;
        let drawWidth = 90;
        let drawHeight = drawWidth * aspect;
        const maxHeight = headerHeight - 32;
        if (drawHeight > maxHeight) {
            drawHeight = maxHeight;
            drawWidth = drawHeight / aspect;
        }
        const logoX = margin;
        const logoY = headerBottom + (headerHeight - drawHeight) / 2;
        drawImage(logo.name, logoX, logoY, drawWidth, drawHeight);
    }

    const headerTextLeft = hasLogo ? margin + 110 : margin;
    const headerTitleY = headerBottom + headerHeight - 32;
    writeText('Sandersdorfer Karnevalsverein e. V.', headerTextLeft, headerTitleY, { font: 'F2', size: 18, color: COLORS.white });
    writeText('Rechnung', headerTextLeft, headerTitleY - 28, { font: 'F2', size: 30, color: COLORS.white });

    let cursorY = headerBottom - 26;
    const displayDate = formatDisplayDate(createdAt);
    writeText(`Rechnungsdatum: ${displayDate}`, margin, cursorY, { size: 11, color: COLORS.muted });
    writeText(`Rechnungsnummer: ${invoiceNumber}`, margin + contentWidth, cursorY, { size: 11, color: COLORS.muted, align: 'right' });
    cursorY -= baseLine;

    drawLine(margin, cursorY + 8, margin + contentWidth, cursorY + 8, COLORS.line, 0.8);
    cursorY -= 6;

    const col1 = margin;
    const colQty = margin + contentWidth * 0.55;
    const colUnit = margin + contentWidth * 0.74;
    const colTotal = margin + contentWidth;

    writeText('Position', col1, cursorY, { size: 11, color: COLORS.muted });
    writeText('Karten', colQty, cursorY, { size: 11, color: COLORS.muted, align: 'right' });
    writeText('Einzelpreis', colUnit, cursorY, { size: 11, color: COLORS.muted, align: 'right' });
    writeText('Gesamt', colTotal, cursorY, { size: 11, color: COLORS.muted, align: 'right' });
    cursorY -= baseLine;

    const safeLines = Array.isArray(lines) ? lines : [];
    if (safeLines.length === 0) {
        writeText('Keine Positionen vorhanden.', col1, cursorY, { size: 12, color: COLORS.muted });
        cursorY -= baseLine;
    } else {
        safeLines.forEach(line => {
            const name = line?.name || 'Position';
            const quantity = Number.isFinite(line?.quantity) ? line.quantity : (line?.quantity ?? '');
            const detail = line?.detail || '';
            const unitPrice = line?.unitPriceFormatted || '';
            const lineTotal = line?.totalFormatted || '';

            writeText(String(name), col1, cursorY, { size: 12, color: COLORS.text });
            writeText(quantity === '' ? '' : String(quantity), colQty, cursorY, { size: 12, align: 'right', color: COLORS.text });
            writeText(unitPrice, colUnit, cursorY, { size: 12, align: 'right', color: COLORS.text });
            writeText(lineTotal, colTotal, cursorY, { size: 12, align: 'right', color: COLORS.text });
            cursorY -= detailLine;
            if (detail) {
                writeText(detail, col1 + 6, cursorY, { size: 10, color: COLORS.muted });
                cursorY -= baseLine;
            } else {
                cursorY -= baseLine * 0.7;
            }
            drawLine(margin, cursorY + 10, margin + contentWidth, cursorY + 10, COLORS.line, 0.3);
        });
    }

    cursorY -= baseLine * 0.2;
    drawLine(margin, cursorY + 14, margin + contentWidth, cursorY + 14, COLORS.line, 0.8);
    cursorY -= baseLine;

    const resolvedPaymentLabel = (paymentLabel && paymentLabel.trim()) || getPaymentLabel(paymentMethod) || '';
    const cardsLabel = Number.isFinite(totalCards)
        ? (totalCards === 1 ? '1 Karte insgesamt' : `${totalCards} Karten insgesamt`)
        : '';

    writeText('Gesamtbetrag', margin, cursorY, { size: 11, color: COLORS.muted });
    const totalPanelTop = cursorY - baseLine * 0.4;
    const totalPanelHeight = baseLine * 3.6;
    fillRect(margin - 12, totalPanelTop - totalPanelHeight, contentWidth + 24, totalPanelHeight, COLORS.panel);
    drawLine(margin - 12, totalPanelTop, margin + contentWidth + 12, totalPanelTop, COLORS.line, 0.4);
    drawLine(margin - 12, totalPanelTop - totalPanelHeight, margin + contentWidth + 12, totalPanelTop - totalPanelHeight, COLORS.line, 0.4);

    cursorY -= baseLine * 2;
    const amountY = cursorY;
    writeText(formatEuro(totalAmount), margin, amountY, { font: 'F2', size: 26, color: COLORS.primaryDark });
    if (cardsLabel) {
        writeText(cardsLabel, margin + contentWidth, amountY + detailLine * 0.8, { size: 11, color: COLORS.muted, align: 'right' });
    }
    if (resolvedPaymentLabel) {
        writeText(`Zahlart ${resolvedPaymentLabel}`, margin + contentWidth, amountY - detailLine * 1.2, { size: 12, color: COLORS.text, align: 'right' });
    }

    cursorY = amountY - baseLine * 1.6;
    writeText('Hinweis: Diese Rechnung gilt nicht als Eintrittskarte.', margin, cursorY, { size: 11, color: COLORS.muted });
    cursorY -= baseLine;
    writeText('Vielen Dank für Ihren Besuch!', margin, cursorY, { size: 12, color: COLORS.primaryDark });

    const footerY = margin + 32;
    drawLine(margin, footerY, margin + contentWidth, footerY, COLORS.line, 0.6);
    writeText('Sandersdorfer Karnevalsverein e. V.', margin + contentWidth / 2, footerY - 16, { size: 10, color: COLORS.muted, align: 'center' });
    writeText('Am Sportzentrum 19 · 06792 Sandersdorf-Brehna', margin + contentWidth / 2, footerY - 30, { size: 10, color: COLORS.muted, align: 'center' });

    return content.join('\n');
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

    const resolvedPaymentLabel = getPaymentLabel(paymentMethod);
    const logoAsset = await loadLogoImage();
    const logoForPdf = logoAsset?.bytes?.length
        ? { name: "LG", width: logoAsset.width, height: logoAsset.height, bytes: logoAsset.bytes }
        : null;

    const sharePayload = {
        invoiceNumber,
        createdAt: createdAt.toISOString(),
        paymentMethod,
        paymentLabel: resolvedPaymentLabel,
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
        paymentLabel: resolvedPaymentLabel,
    }, { logo: logoForPdf });

    const pdfBytes = createPdfObjects(contentStream, { logo: logoForPdf });
    const base64 = bytesToBase64(pdfBytes);
    const dataUrl = `data:application/pdf;base64,${base64}`;
    const fileName = `Rechnung_${invoiceNumber}.pdf`;

    const invoice = {
        id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: createdAt.toISOString(),
        invoiceNumber,
        paymentMethod,
        paymentLabel: resolvedPaymentLabel,
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

export async function buildPdfFromPayload(payload) {
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
    const logoAsset = await loadLogoImage();
    const logoForPdf = logoAsset?.bytes?.length
        ? { name: "LG", width: logoAsset.width, height: logoAsset.height, bytes: logoAsset.bytes }
        : null;

    const contentStream = buildPdfContent({
        createdAt,
        invoiceNumber,
        lines,
        totalAmount,
        totalCards,
        paymentMethod,
        paymentLabel: payload.paymentLabel || getPaymentLabel(paymentMethod),
    }, { logo: logoForPdf });

    return createPdfObjects(contentStream, { logo: logoForPdf });
}
