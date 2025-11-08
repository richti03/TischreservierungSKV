package com.example.tischreservierungskv.state;

import com.example.tischreservierungskv.state.dto.EventStateResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api", produces = MediaType.APPLICATION_JSON_VALUE)
public class EventStateController {

    private final EventStateService eventStateService;

    public EventStateController(EventStateService eventStateService) {
        this.eventStateService = eventStateService;
    }

    @GetMapping("/event-state")
    public EventStateResponse getEventState() {
        return eventStateService.getDefaultEventState();
    }
}
