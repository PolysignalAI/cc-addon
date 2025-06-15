import { debug } from "../../constants.js";

/**
 * Manages tooltip lifecycle, positioning, and interactions
 * Now with reactive updates when settings change
 */
export class TooltipManager {
  constructor() {
    this.activeTooltips = new Map(); // Map<element, tooltip>
    this.tooltipData = new Map(); // Map<tooltip, {baseCurrency, originalPrice, element}>
    this.tooltipPortal = null;
    this.positionTrackers = new Map();
    this.currencyConverter = null; // Will be injected
    this.settings = null; // Will be injected
  }

  /**
   * Set dependencies
   */
  setDependencies(currencyConverter, settings) {
    this.currencyConverter = currencyConverter;
    this.settings = settings;
  }

  /**
   * Initialize tooltip portal
   */
  initPortal() {
    if (!this.tooltipPortal) {
      this.tooltipPortal = document.createElement("div");
      this.tooltipPortal.id = "currency-converter-portal";
      this.tooltipPortal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 0;
        pointer-events: none;
        z-index: 2147483647;
      `;
      document.body.appendChild(this.tooltipPortal);
    }
    return this.tooltipPortal;
  }

  /**
   * Create tooltip element
   */
  createTooltip(conversions, baseCurrency, originalPrice) {
    const tooltip = document.createElement("div");
    tooltip.className = "currency-tooltip";

    // Build tooltip content
    const content = this.buildTooltipContent(
      conversions,
      baseCurrency,
      originalPrice
    );
    tooltip.innerHTML = content;

    // Store metadata for reactive updates
    this.tooltipData.set(tooltip, {
      baseCurrency,
      originalPrice,
      element: null, // Will be set when shown
    });

    return tooltip;
  }

  /**
   * Build tooltip HTML content
   */
  buildTooltipContent(conversions, baseCurrency, originalPrice) {
    let html = '<div class="currency-tooltip-content">';

    for (const conversion of conversions) {
      const { currency, amount, symbol, formatted } = conversion;
      const isBase = currency === baseCurrency;

      html += `
        <div class="currency-item ${isBase ? "base-currency" : ""}">
          <span class="currency-code">${currency}</span>
          <span class="currency-amount">${symbol}${formatted}</span>
        </div>
      `;
    }

    html += "</div>";
    return html;
  }

  /**
   * Show tooltip for element
   */
  show(targetElement, tooltip) {
    try {
      // Clear any existing timeout
      if (tooltip._hideTimeout) {
        clearTimeout(tooltip._hideTimeout);
        delete tooltip._hideTimeout;
      }

      // Initialize portal if needed
      const portal = this.initPortal();
      if (!portal) {
        debug.error("Failed to create tooltip portal");
        return;
      }

      // Add to portal
      if (!tooltip.parentNode) {
        portal.appendChild(tooltip);
        debug.log(
          "Tooltip added to portal, content children count:",
          tooltip.children.length
        );
      }

      // Update tooltip data with element reference
      const data = this.tooltipData.get(tooltip);
      if (data) {
        data.element = targetElement;
      }

      // Position tooltip
      this.position(targetElement, tooltip);

      // Make visible
      tooltip.classList.add("show");
      tooltip.style.display = "block";
      tooltip.style.visibility = "visible";
      tooltip.style.opacity = "1";
      tooltip.style.pointerEvents = "none"; // Changed from "auto" to prevent event capture

      // Track active tooltip
      this.activeTooltips.set(targetElement, tooltip);

      // Start position tracking
      this.startPositionTracking(targetElement, tooltip);
    } catch (error) {
      debug.error("Error showing tooltip:", error);
    }
  }

  /**
   * Hide tooltip
   */
  hide(tooltip, immediate = false) {
    if (!tooltip) return;

    // Stop position tracking
    const targetElement = this.getElementForTooltip(tooltip);
    if (targetElement) {
      this.stopPositionTracking(targetElement);
      this.activeTooltips.delete(targetElement);
    }

    if (immediate) {
      tooltip.classList.remove("show");
      this.removeTooltip(tooltip);
    } else {
      // Fade out
      tooltip.classList.remove("show");
      tooltip.style.opacity = "0";
      tooltip.style.pointerEvents = "none";

      // Remove after animation
      tooltip._hideTimeout = setTimeout(() => {
        this.removeTooltip(tooltip);
      }, 200);
    }
  }

  /**
   * Remove tooltip from DOM
   */
  removeTooltip(tooltip) {
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
  }

  /**
   * Position tooltip relative to target element
   */
  position(targetElement, tooltip) {
    const rect = targetElement.getBoundingClientRect();

    // Since portal is fixed position, use viewport coordinates
    tooltip.style.position = "fixed";

    // Position above the element
    tooltip.style.bottom = "auto";
    tooltip.style.top = rect.top - 10 + "px"; // 10px gap above element
    tooltip.style.left = rect.left + rect.width / 2 + "px";
    tooltip.style.transform = "translateX(-50%) translateY(-100%)";

    // Prevent tooltip from going off-screen
    const padding = 10;

    // Get tooltip dimensions after initial positioning
    const tooltipRect = tooltip.getBoundingClientRect();

    // Adjust if tooltip goes off screen
    // Check if tooltip goes above viewport, flip to below
    if (rect.top - tooltipRect.height - 10 < 0) {
      tooltip.style.top = rect.bottom + 10 + "px";
      tooltip.style.transform = "translateX(-50%)";
    }
  }

  /**
   * Start tracking element position for tooltip updates
   */
  startPositionTracking(targetElement, tooltip) {
    // Use IntersectionObserver for efficient position tracking
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          this.position(targetElement, tooltip);
        } else {
          this.hide(tooltip);
        }
      },
      {
        threshold: [0, 1],
      }
    );

    observer.observe(targetElement);
    this.positionTrackers.set(targetElement, observer);

    // Also track scroll
    const scrollHandler = () => {
      if (this.activeTooltips.has(targetElement)) {
        this.position(targetElement, tooltip);
      }
    };

    window.addEventListener("scroll", scrollHandler, { passive: true });
    targetElement._scrollHandler = scrollHandler;
  }

  /**
   * Stop tracking element position
   */
  stopPositionTracking(targetElement) {
    const observer = this.positionTrackers.get(targetElement);
    if (observer) {
      observer.disconnect();
      this.positionTrackers.delete(targetElement);
    }

    // Remove scroll handler
    if (targetElement._scrollHandler) {
      window.removeEventListener("scroll", targetElement._scrollHandler);
      delete targetElement._scrollHandler;
    }
  }

  /**
   * Get element associated with tooltip
   */
  getElementForTooltip(tooltip) {
    for (const [element, activeTooltip] of this.activeTooltips) {
      if (activeTooltip === tooltip) {
        return element;
      }
    }
    return null;
  }

  /**
   * Get tooltip associated with an element
   */
  getTooltipForElement(element) {
    return this.activeTooltips.get(element) || null;
  }

  /**
   * Remove a specific tooltip
   */
  removeTooltip(tooltip) {
    // Find the element associated with this tooltip
    const element = this.getElementForTooltip(tooltip);
    if (element) {
      this.hide(tooltip);
      this.activeTooltips.delete(element);
    }
    if (tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
  }

  /**
   * Update tooltip content
   */
  updateTooltipContent(tooltip, content) {
    if (tooltip && content) {
      tooltip.innerHTML = content;
    }
  }

  /**
   * Hide all tooltips
   */
  hideAll() {
    // Clear any pending hide timeouts
    for (const [element, tooltip] of this.activeTooltips) {
      if (tooltip._hideTimeout) {
        clearTimeout(tooltip._hideTimeout);
        delete tooltip._hideTimeout;
      }
      // Stop position tracking
      this.stopPositionTracking(element);
    }

    // Clear active tooltips map
    this.activeTooltips.clear();

    // Remove all tooltips from DOM
    const allTooltips = document.querySelectorAll(".currency-tooltip");
    allTooltips.forEach((tooltip) => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    });

    // Remove portal if empty
    if (this.tooltipPortal && this.tooltipPortal.children.length === 0) {
      this.tooltipPortal.remove();
      this.tooltipPortal = null;
    }
  }

  /**
   * Update tooltip theme
   */
  applyTheme(tooltip, theme) {
    if (!tooltip) return;

    // Remove existing theme classes
    tooltip.classList.remove("theme-dark", "theme-light");

    // Add new theme class
    tooltip.classList.add(`theme-${theme}`);
  }

  /**
   * Clean up all tooltips and event listeners
   */
  cleanup() {
    // Stop all position tracking
    for (const [element, observer] of this.positionTrackers) {
      observer.disconnect();

      // Remove scroll handler
      if (element._scrollHandler) {
        window.removeEventListener("scroll", element._scrollHandler);
        delete element._scrollHandler;
      }
    }
    this.positionTrackers.clear();

    // Remove all tooltips
    for (const [element, tooltip] of this.activeTooltips) {
      if (tooltip._hideTimeout) {
        clearTimeout(tooltip._hideTimeout);
      }
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }

    // Clear maps
    this.activeTooltips.clear();
    this.tooltipData.clear();

    // Remove portal
    if (this.tooltipPortal) {
      this.tooltipPortal.remove();
      this.tooltipPortal = null;
    }
  }

  /**
   * Get active tooltip count
   */
  getActiveCount() {
    return this.activeTooltips.size;
  }

  /**
   * Check if element has active tooltip
   */
  hasTooltip(element) {
    return this.activeTooltips.has(element);
  }

  /**
   * Update all active tooltips with new conversions
   */
  updateAllTooltips() {
    debug.log(
      "Updating all tooltips - active count:",
      this.activeTooltips.size
    );

    // First update all active (visible) tooltips
    for (const [element, tooltip] of this.activeTooltips) {
      this.updateTooltip(element, tooltip);
    }

    // Then update all tooltips attached to price wrappers (including hidden ones)
    this.updateAllWrapperTooltips();
  }

  /**
   * Update all tooltips attached to price wrappers
   */
  updateAllWrapperTooltips() {
    // With the new approach of always recalculating on hover,
    // we don't need to update tooltip content here.
    // This method is kept for compatibility but can be a no-op.
    debug.log("Tooltip content will be updated on next hover");
  }

  /**
   * Update a specific tooltip
   */
  updateTooltip(element, tooltip) {
    const data = this.tooltipData.get(tooltip);
    if (!data || !this.currencyConverter || !this.settings) {
      debug.warn("Missing data for tooltip update");
      return;
    }

    // Get current settings
    const selectedCurrencies = this.settings.getSelectedCurrencies();
    const baseCurrency = element.dataset.currency;
    const originalPrice = parseFloat(element.dataset.amount);

    debug.log(
      "updateTooltip - selectedCurrencies from settings:",
      selectedCurrencies
    );

    if (!baseCurrency || isNaN(originalPrice)) {
      debug.warn("Invalid element data for tooltip update");
      return;
    }

    // Recalculate conversions
    const conversions = this.currencyConverter.calculateConversions(
      originalPrice,
      baseCurrency,
      selectedCurrencies
    );

    debug.log("Conversions calculated:", conversions);

    // Update tooltip content
    const content = this.buildTooltipContent(
      conversions,
      baseCurrency,
      originalPrice
    );
    tooltip.innerHTML = content;
  }

  /**
   * Create tooltip content that updates automatically
   */
  createReactiveTooltip(element) {
    const baseCurrency = element.dataset.currency;
    const originalPrice = parseFloat(element.dataset.amount);

    if (!baseCurrency || isNaN(originalPrice)) {
      debug.error("Invalid element data for tooltip");
      return null;
    }

    // Calculate initial conversions
    const selectedCurrencies = this.settings.getSelectedCurrencies();
    const conversions = this.currencyConverter.calculateConversions(
      originalPrice,
      baseCurrency,
      selectedCurrencies
    );

    // Create tooltip
    const tooltip = this.createTooltip(
      conversions,
      baseCurrency,
      originalPrice
    );

    return tooltip;
  }
}
