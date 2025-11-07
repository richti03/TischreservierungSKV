import { onCartChange, getCartEntries } from "../features/cart.js";
import { openCartModal } from "../features/cartModal.js";

/**
 * Verwaltet den Warenkorb-Button im Header inklusive Badge.
 */
export function initializeCartHeader({ logger = console } = {}) {
    const cartToggle = document.getElementById("cart-toggle");
    const cartBadge = document.getElementById("cart-badge");

    const updateCartBadge = entries => {
        if (!cartBadge || !cartToggle) {
            return;
        }
        const list = Array.isArray(entries) ? entries : getCartEntries();
        const count = list.length;
        cartBadge.textContent = String(count);
        cartBadge.hidden = count === 0;
        cartToggle.classList.toggle("has-items", count > 0);
        const label = count === 0
            ? "Warenkorb öffnen"
            : `Warenkorb öffnen (${count} ${count === 1 ? "Reservierung" : "Reservierungen"})`;
        cartToggle.setAttribute("aria-label", label);
        logger.debug?.("[CartHeader] Warenkorb-Badge aktualisiert", { count });
    };

    cartToggle?.addEventListener("click", () => {
        openCartModal();
    });

    onCartChange(updateCartBadge);
    updateCartBadge();

    return { updateCartBadge };
}
