package com.example.tischreservierungskv.invoice;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Path;

@RestController
@RequestMapping(path = "/api/invoices", produces = MediaType.APPLICATION_JSON_VALUE)
public class InvoiceController {

    private final InvoiceStorageService storageService;

    public InvoiceController(InvoiceStorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public InvoiceSaveResponse storeInvoice(@Valid @RequestBody InvoiceSaveRequest request) {
        try {
            Path savedFile = storageService.saveInvoice(request);
            String relativePath = savedFile.toString().replace('\\', '/');
            return new InvoiceSaveResponse(relativePath, savedFile.getFileName().toString());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Rechnung konnte nicht gespeichert werden.", ex);
        }
    }

}
