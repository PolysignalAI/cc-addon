import { PriceConverter } from "./modules/core/PriceConverter.js";
import { debug, DEBUG } from "./constants.js";

debug.log("Currency Converter content script loaded!", window.location.href);

// Ensure chrome API is available (Firefox compatibility)
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  window.chrome = browser;
}

/**
 * Currency Converter Content Script
 *
 * This is the entry point for the content script.
 * The monolithic 2700+ line file has been refactored into a clean modular architecture.
 *
 * Modules:
 * - core/: Main coordination and settings management
 * - detection/: Currency and price detection logic
 * - conversion/: Currency conversion calculations
 * - ui/: Tooltips and styling
 * - performance/: Optimization utilities (to be added)
 * - utils/: Shared utilities (to be added)
 */

// Check if we should run on this page
if (
  window.location.protocol === "chrome-extension:" ||
  window.location.protocol === "moz-extension:" ||
  window.location.href.includes("extension://")
) {
  debug.log("Content script disabled on extension page");
} else {
  // Initialize price converter
  debug.log("Initializing PriceConverter");
  const priceConverter = new PriceConverter();

  // Handle errors globally
  window.addEventListener("error", (event) => {
    debug.error("Global error:", event.error);
  });

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      priceConverter.init();
    });
  } else {
    priceConverter.init();
  }

  // Make converter available for debugging immediately
  if (DEBUG) {
    window.__priceConverter = priceConverter;
    debug.log("Debug reference set: window.__priceConverter");
  }

  // Handle cleanup
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      debug.log("Page becoming hidden, cleaning up");
      priceConverter.cleanup();
    }
  });

  window.addEventListener("pagehide", () => {
    debug.log("Page hide event, cleaning up");
    priceConverter.cleanup();
  });
}

// Export for testing
export { PriceConverter };
