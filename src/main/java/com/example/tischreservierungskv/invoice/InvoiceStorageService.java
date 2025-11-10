package com.example.tischreservierungskv.invoice;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Base64;

@Service
public class InvoiceStorageService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final Path BASE_DIRECTORY = Paths.get("Rechnungen");

    public Path saveInvoice(InvoiceSaveRequest request) throws IOException {
        if (request == null) {
            throw new IllegalArgumentException("Anfrage darf nicht null sein.");
        }

        byte[] pdfBytes = decodeBase64(request.getPdfBase64());
        if (pdfBytes.length == 0) {
            throw new IllegalArgumentException("PDF-Inhalt darf nicht leer sein.");
        }

        String safeFileName = sanitizeFileName(request.getFileName());
        if (!safeFileName.toLowerCase().endsWith(".pdf")) {
            safeFileName = safeFileName + ".pdf";
        }

        LocalDate folderDate = resolveEventDate(request.getEventDate());
        String folderType = resolveEventType(request.getEventType());
        Path targetDirectory = BASE_DIRECTORY.resolve(buildFolderName(folderDate, folderType));
        Files.createDirectories(targetDirectory);

        Path targetFile = targetDirectory.resolve(safeFileName);
        Files.write(targetFile, pdfBytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        return BASE_DIRECTORY.relativize(targetFile);
    }

    private byte[] decodeBase64(String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("PDF-Inhalt fehlt.");
        }
        try {
            return Base64.getDecoder().decode(value.trim());
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("PDF-Inhalt konnte nicht dekodiert werden.", ex);
        }
    }

    private LocalDate resolveEventDate(String eventDate) {
        if (StringUtils.hasText(eventDate)) {
            try {
                return LocalDate.parse(eventDate.trim(), DATE_FORMATTER);
            } catch (DateTimeParseException ignored) {
                // Fallback below
            }
        }
        return LocalDate.now();
    }

    private String resolveEventType(String eventType) {
        if (StringUtils.hasText(eventType)) {
            return sanitizePathSegment(eventType.trim());
        }
        return "Veranstaltung";
    }

    private String buildFolderName(LocalDate date, String eventType) {
        return DATE_FORMATTER.format(date) + "-" + eventType;
    }

    private String sanitizeFileName(String input) {
        if (!StringUtils.hasText(input)) {
            return "Rechnung";
        }
        String fileName = Paths.get(input.trim()).getFileName().toString();
        if (!StringUtils.hasText(fileName)) {
            fileName = "Rechnung";
        }
        fileName = Normalizer.normalize(fileName, Normalizer.Form.NFKD)
                .replaceAll("[\\u0300-\\u036f]", "")
                .replaceAll("[^0-9A-Za-z._-]+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^[.-]+|[.-]+$", "");
        if (!StringUtils.hasText(fileName)) {
            return "Rechnung";
        }
        return fileName;
    }

    private String sanitizePathSegment(String input) {
        String normalized = Normalizer.normalize(input, Normalizer.Form.NFKD)
                .replaceAll("[\\u0300-\\u036f]", "");
        String sanitized = normalized
                .replaceAll("[^0-9A-Za-z._-]+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^[.-]+|[.-]+$", "");
        if (!StringUtils.hasText(sanitized)) {
            return "Veranstaltung";
        }
        return sanitized;
    }
}
