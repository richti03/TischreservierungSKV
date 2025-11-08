package com.example.tischreservierungskv.state;

import com.example.tischreservierungskv.state.dto.EventStateResponse;
import com.example.tischreservierungskv.state.dto.TableDefinition;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class EventStateService {

    private static final List<TableDefinition> DEFAULT_TABLES = List.of(
            new TableDefinition(0, 76, "standing", null),
            new TableDefinition(1, 18, "left", null),
            new TableDefinition(2, 18, "left", null),
            new TableDefinition(3, 18, "left", null),
            new TableDefinition(4, 18, "left", null),
            new TableDefinition(5, 18, "left", null),
            new TableDefinition(6, 18, "middle", null),
            new TableDefinition(7, 18, "middle", null),
            new TableDefinition(8, 24, "middle", null),
            new TableDefinition(9, 24, "middle", null),
            new TableDefinition(10, 24, "middle", null),
            new TableDefinition(11, 24, "middle", null),
            new TableDefinition(12, 18, "middle", null),
            new TableDefinition(13, 18, "middle", null),
            new TableDefinition(14, 12, "right", null),
            new TableDefinition(15, 18, "right", null),
            new TableDefinition(16, 18, "right", "oben"),
            new TableDefinition(17, 18, "right", null)
    );

    public EventStateResponse getDefaultEventState() {
        return new EventStateResponse(
                DEFAULT_TABLES,
                "",
                "",
                Map.of(),
                19.5,
                "",
                0,
                null
        );
    }
}
