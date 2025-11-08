package com.example.tischreservierungskv.state.dto;

import java.util.List;
import java.util.Map;

public record EventStateResponse(
        List<TableDefinition> tisch,
        String alleAktionen,
        String alleExportCodes,
        Map<Integer, List<Map<String, Object>>> reservationsByTable,
        double cardPriceValue,
        String externalEventName,
        int lastBookingSeq,
        String lastReservationsFilename
) {
}
