import {
    getCardPriceValue,
    onCardPriceChange,
    setCardPriceValue,
} from "../core/state.js";

/**
 * Kümmert sich um das Einstellungs-Sidepanel inklusive Kartenpreis-Anzeige
 * und -Bearbeitung. Liefert eine Update-Funktion zurück, damit andere Module
 * das UI bei globalen Re-Renders aktualisieren können.
 */
export function initializeSettingsPanel({ logger = console } = {}) {
    const settingsPanel = document.getElementById("settings-panel");
    const settingsToggle = document.getElementById("settings-toggle");
    const settingsClose = document.getElementById("settings-close");
    const settingsBackdrop = document.getElementById("settings-backdrop");
    const cardPriceDisplay = document.getElementById("card-price-value");
    const cardPriceEdit = document.getElementById("card-price-edit");

    const euroFormatter = new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
    });

    const updateCardPriceDisplay = () => {
        if (!cardPriceDisplay) {
            return;
        }
        const value = getCardPriceValue();
        cardPriceDisplay.textContent = euroFormatter.format(value);
        cardPriceDisplay.dataset.price = value.toString();
    };

    let initialPrice = parseFloat(cardPriceDisplay?.dataset?.price || "");
    if (!Number.isFinite(initialPrice) || initialPrice < 0) {
        initialPrice = getCardPriceValue();
    }
    setCardPriceValue(initialPrice);

    const onSettingsKeydown = event => {
        if (event.key === "Escape") {
            closeSettingsPanel();
            settingsToggle?.focus();
        }
    };

    const closeSettingsPanel = () => {
        if (!settingsPanel) {
            return;
        }
        settingsPanel.classList.remove("is-open");
        settingsPanel.setAttribute("aria-hidden", "true");
        if (settingsBackdrop) {
            settingsBackdrop.classList.remove("is-visible");
            settingsBackdrop.hidden = true;
        }
        document.removeEventListener("keydown", onSettingsKeydown);
        logger.debug?.("[SettingsPanel] Panel geschlossen");
    };

    const openSettingsPanel = () => {
        if (!settingsPanel) {
            return;
        }
        settingsPanel.classList.add("is-open");
        settingsPanel.setAttribute("aria-hidden", "false");
        if (settingsBackdrop) {
            settingsBackdrop.hidden = false;
            requestAnimationFrame(() => settingsBackdrop.classList.add("is-visible"));
        }
        settingsPanel.focus({ preventScroll: true });
        document.addEventListener("keydown", onSettingsKeydown);
        logger.debug?.("[SettingsPanel] Panel geöffnet");
    };

    settingsToggle?.addEventListener("click", () => {
        if (settingsPanel?.classList.contains("is-open")) {
            closeSettingsPanel();
        } else {
            openSettingsPanel();
        }
    });

    settingsClose?.addEventListener("click", () => {
        closeSettingsPanel();
        settingsToggle?.focus();
    });

    settingsBackdrop?.addEventListener("click", () => {
        closeSettingsPanel();
    });

    cardPriceEdit?.addEventListener("click", () => {
        const current = getCardPriceValue();
        const input = window.prompt(
            "Neuer Kartenpreis in Euro",
            euroFormatter.format(current).replace(/\s/g, ""),
        );
        if (input == null) {
            return;
        }
        const normalized = input
            .replace(/€/g, "")
            .replace(/\s/g, "")
            .replace(/,/g, ".");
        const value = Number.parseFloat(normalized);
        if (!Number.isFinite(value) || value < 0) {
            window.alert("Bitte geben Sie einen gültigen Preis ein.");
            return;
        }
        setCardPriceValue(value);
        logger.info?.("[SettingsPanel] Kartenpreis aktualisiert", value);
    });

    onCardPriceChange(() => {
        updateCardPriceDisplay();
    });

    updateCardPriceDisplay();

    if (!settingsPanel) {
        logger.info("[SettingsPanel] Kein Settings-Panel vorhanden (optional).");
    }

    return { updateCardPriceDisplay, closeSettingsPanel, openSettingsPanel };
}
