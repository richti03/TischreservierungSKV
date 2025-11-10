package com.example.tischreservierungskv.invoice;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class InvoiceStorageServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void savesInvoiceUnderExpectedFolderStructure() throws IOException {
        InvoiceStorageService service = new InvoiceStorageService(tempDir.toString());
        InvoiceSaveRequest request = new InvoiceSaveRequest();
        request.setInvoiceNumber("SKV-2025-11-15-1234");
        request.setFileName("Meine Rechnung.pdf");
        request.setPdfBase64(Base64.getEncoder().encodeToString("Hallo".getBytes(StandardCharsets.UTF_8)));
        request.setEventDate("2025-11-15");
        request.setEventType("Lumpenball");

        Path relative = service.saveInvoice(request);

        assertThat(relative.toString()).isEqualTo("2025-11-15-Lumpenball/Meine-Rechnung.pdf");
        Path savedFile = tempDir.resolve(relative);
        assertThat(Files.exists(savedFile)).isTrue();
        assertThat(Files.readString(savedFile, StandardCharsets.UTF_8)).isEqualTo("Hallo");
    }

    @Test
    void fallsBackToTodayWhenEventDateMissing() throws IOException {
        InvoiceStorageService service = new InvoiceStorageService(tempDir.toString());
        InvoiceSaveRequest request = new InvoiceSaveRequest();
        request.setInvoiceNumber("SKV-123");
        request.setFileName("re.pdf");
        request.setPdfBase64(Base64.getEncoder().encodeToString(new byte[]{0x01, 0x02, 0x03}));
        request.setEventType("Fasching");

        Path relative = service.saveInvoice(request);

        String expectedPrefix = LocalDate.now().toString() + "-Fasching";
        assertThat(relative.toString()).startsWith(expectedPrefix);
        Path savedFile = tempDir.resolve(relative);
        assertThat(Files.exists(savedFile)).isTrue();
        assertThat(Files.readAllBytes(savedFile)).containsExactly(0x01, 0x02, 0x03);
    }
}
