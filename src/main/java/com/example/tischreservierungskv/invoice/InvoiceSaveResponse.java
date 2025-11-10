package com.example.tischreservierungskv.invoice;

public class InvoiceSaveResponse {

    private final String relativePath;
    private final String fileName;

    public InvoiceSaveResponse(String relativePath, String fileName) {
        this.relativePath = relativePath;
        this.fileName = fileName;
    }

    public String getRelativePath() {
        return relativePath;
    }

    public String getFileName() {
        return fileName;
    }
}
