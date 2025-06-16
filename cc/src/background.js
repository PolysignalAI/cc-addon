import { debug } from "./constants.js";
import { ExchangeRateManager } from "./modules/core/ExchangeRateManager.js";
import { MessageBus } from "./modules/core/MessageBus.js";

/**
 * Background script - handles exchange rate updates and message routing
 */

// Create singleton instances
const messageBus = new MessageBus();
const exchangeRateManager = new ExchangeRateManager();

// Initialize exchange rate manager
exchangeRateManager
  .init()
  .then(() => {
    debug.log("Exchange rate manager initialized");
  })
  .catch((error) => {
    debug.error("Failed to initialize exchange rate manager:", error);
  });

// Set up message handlers
messageBus.on("getRates", async () => {
  const rates = exchangeRateManager.getRates();
  const lastUpdated = exchangeRateManager.getLastUpdated();

  return {
    fiat: {},
    crypto: {},
    ...rates,
    lastUpdate: lastUpdated,
  };
});

messageBus.on("forceUpdate", async () => {
  try {
    await exchangeRateManager.forceUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Legacy message handlers for backward compatibility
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    // Simple ping to keep service worker alive
    sendResponse({ pong: true });
    return true;
  } else if (request.action === "getRates") {
    const rates = exchangeRateManager.getRates();
    const lastUpdated = exchangeRateManager.getLastUpdated();

    // Split rates into fiat and crypto for backward compatibility
    const fiatRates = {};
    const cryptoRates = {};

    for (const [currency, rate] of Object.entries(rates)) {
      if (currency.length === 3 && currency === currency.toUpperCase()) {
        // Likely fiat (USD, EUR, etc)
        if (
          ![
            "BTC",
            "ETH",
            "BNB",
            "XRP",
            "ADA",
            "SOL",
            "DOT",
            "DOGE",
            "AVAX",
            "MATIC",
          ].includes(currency)
        ) {
          fiatRates[currency] = rate;
        } else {
          cryptoRates[currency] = rate;
        }
      } else {
        cryptoRates[currency] = rate;
      }
    }

    sendResponse({
      fiat: fiatRates,
      crypto: cryptoRates,
      lastUpdate: lastUpdated,
    });
    return true; // Keep channel open for async response
  } else if (
    request.action === "forceSync" ||
    request.action === "forceUpdate"
  ) {
    exchangeRateManager
      .forceUpdate()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open
  } else if (request.action === "convertCurrency") {
    const { amount, fromCurrency, toCurrency } = request;
    const rates = exchangeRateManager.getRates();

    // Simple conversion through USD
    const fromRate = fromCurrency === "USD" ? 1 : rates[fromCurrency];
    const toRate = toCurrency === "USD" ? 1 : rates[toCurrency];

    if (fromRate && toRate) {
      const result = amount * (toRate / fromRate);
      sendResponse({ result });
    } else {
      sendResponse({ result: null });
    }
    return true; // Keep channel open for async response
  }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    debug.log("Extension installed");
    // Initialize with default settings
    chrome.storage.sync.set({
      extensionEnabled: true,
      baseCurrency: "USD",
      selectedCurrencies: ["USD", "EUR", "GBP", "BTC"],
      favoriteCurrencies: ["USD", "EUR", "GBP", "BTC", "ETH"],
    });
  } else if (details.reason === "update") {
    debug.log(
      "Extension updated to version",
      chrome.runtime.getManifest().version
    );
  }
});

// Clean up on suspension (Chrome only)
if (chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    debug.log("Background script suspending");
    exchangeRateManager.cleanup();
  });
}

debug.log("Background script initialized");
