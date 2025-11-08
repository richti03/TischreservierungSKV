package com.example.tischreservierungskv;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

import java.awt.*;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.concurrent.CompletableFuture;

@Component
public class BrowserLauncher implements ApplicationListener<ApplicationReadyEvent> {

    private static final Logger LOGGER = LoggerFactory.getLogger(BrowserLauncher.class);
    private final ServletWebServerApplicationContext applicationContext;

    public BrowserLauncher(ServletWebServerApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        if (!Desktop.isDesktopSupported()) {
            LOGGER.info("Skipping automatic browser launch because AWT desktop is not supported.");
            return;
        }

        Desktop desktop;
        try {
            desktop = Desktop.getDesktop();
        } catch (HeadlessException headlessException) {
            LOGGER.info("Skipping automatic browser launch in headless environment.");
            return;
        }

        if (!desktop.isSupported(Desktop.Action.BROWSE)) {
            LOGGER.info("Skipping automatic browser launch because browsing is not supported.");
            return;
        }

        URI target;
        try {
            int port = applicationContext.getWebServer().getPort();
            target = new URI("http://localhost:" + port + "/");
        } catch (URISyntaxException e) {
            LOGGER.warn("Could not create URI for automatic browser launch", e);
            return;
        }

        CompletableFuture.runAsync(() -> {
            try {
                desktop.browse(target);
                LOGGER.info("Opened default browser at {}", target);
            } catch (IOException browseError) {
                LOGGER.warn("Failed to open browser window", browseError);
            }
        });
    }
}
