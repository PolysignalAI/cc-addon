import {
  debug,
  API_ENDPOINTS,
  SUPPORTED_FIAT_CURRENCIES,
  SUPPORTED_CRYPTO_CURRENCIES,
  COINGECKO_ID_TO_SYMBOL,
  SYMBOL_TO_COINGECKO_ID,
} from "../../constants.js";

/**
 * Consolidated exchange rate management
 * Single source of truth for all exchange rates
 */
export class ExchangeRateManager {
  constructor() {
    this.updateInterval = 5 * 60 * 1000; // 5 minutes
    this.retryCount = 0;
    this.maxRetries = 3;
    this.updateTimer = null;
    this.isUpdating = false;

    // Local state
    this.exchangeRates = {};
    this.lastUpdated = null;
    this.isLoading = false;
    this.error = null;
  }

  /**
   * Initialize and start periodic updates
   */
  async init() {
    debug.log("Initializing ExchangeRateManager");

    // Load cached rates from storage
    const stored = await this.loadFromStorage();
    if (stored) {
      this.exchangeRates = stored.rates;
      this.lastUpdated = stored.lastUpdated;
    }

    // Check if update needed
    const needsUpdate =
      !stored || Date.now() - stored.lastUpdated > this.updateInterval;
    if (needsUpdate) {
      await this.updateRates();
    }

    // Start periodic updates
    this.startPeriodicUpdates();
  }

  /**
   * Load rates from storage
   */
  async loadFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["exchangeRates", "lastUpdated"], (result) => {
        if (result.exchangeRates && result.lastUpdated) {
          resolve({
            rates: result.exchangeRates,
            lastUpdated: result.lastUpdated,
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Save rates to storage
   */
  async saveToStorage(rates, timestamp) {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          exchangeRates: rates,
          lastUpdated: timestamp,
        },
        resolve
      );
    });
  }

  /**
   * Start periodic rate updates
   */
  startPeriodicUpdates() {
    // Clear any existing timer
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    // Set up periodic updates
    this.updateTimer = setInterval(() => {
      this.updateRates();
    }, this.updateInterval);

    // Also set up chrome alarm as backup
    chrome.alarms.create("updateExchangeRates", {
      periodInMinutes: 5,
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "updateExchangeRates") {
        this.updateRates();
      }
    });
  }

  /**
   * Update all exchange rates
   */
  async updateRates() {
    if (this.isUpdating) {
      debug.log("Rate update already in progress");
      return;
    }

    this.isUpdating = true;
    this.isLoading = true;

    try {
      debug.log("Updating exchange rates...");

      // Fetch both fiat and crypto rates in parallel
      const [fiatRates, cryptoRates] = await Promise.all([
        this.fetchFiatRates(),
        this.fetchCryptoRates(),
      ]);

      // Merge rates
      const allRates = { ...fiatRates, ...cryptoRates };
      const timestamp = Date.now();

      // Update state
      this.exchangeRates = allRates;
      this.lastUpdated = timestamp;
      this.isLoading = false;
      this.error = null;

      // Save to storage
      await this.saveToStorage(allRates, timestamp);

      // Broadcast update to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(
              tab.id,
              {
                action: "ratesUpdated",
                rates: allRates,
                timestamp,
              },
              () => {
                // Ignore errors for tabs without content script
                if (chrome.runtime.lastError) {
                  // Silent fail
                }
              }
            );
          }
        });
      });

      this.retryCount = 0;
      debug.log("Exchange rates updated successfully");
    } catch (error) {
      debug.error("Failed to update rates:", error);

      this.isLoading = false;
      this.error = error.message;

      // Retry with exponential backoff
      this.scheduleRetry();
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Fetch fiat rates from API
   */
  async fetchFiatRates() {
    const url = `${API_ENDPOINTS.FRANKFURTER}?base=USD`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Fiat API error: ${response.status}`);
    }

    const data = await response.json();

    // Add USD as base
    const rates = { USD: 1 };

    // Add other supported currencies
    for (const currency of SUPPORTED_FIAT_CURRENCIES) {
      if (data.rates[currency] !== undefined) {
        rates[currency] = data.rates[currency];
      }
    }

    return rates;
  }

  /**
   * Fetch crypto rates from API
   */
  async fetchCryptoRates() {
    const coinIds = Object.keys(COINGECKO_ID_TO_SYMBOL).join(",");
    const url = `${API_ENDPOINTS.COINGECKO}?ids=${coinIds}&vs_currencies=usd`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Crypto API error: ${response.status}`);
    }

    const data = await response.json();
    const rates = {};

    // Convert to our format (1 USD = X crypto)
    for (const [coinId, priceData] of Object.entries(data)) {
      const symbol = COINGECKO_ID_TO_SYMBOL[coinId];
      if (symbol && priceData.usd) {
        rates[symbol] = 1 / priceData.usd;
      }
    }

    return rates;
  }

  /**
   * Schedule retry after failure
   */
  scheduleRetry() {
    this.retryCount++;

    if (this.retryCount <= this.maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 30000);
      debug.log(
        `Scheduling retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`
      );

      setTimeout(() => {
        this.updateRates();
      }, delay);
    }
  }

  /**
   * Get current rates
   */
  getRates() {
    return this.exchangeRates || {};
  }

  /**
   * Get last update time
   */
  getLastUpdated() {
    return this.lastUpdated;
  }

  /**
   * Force immediate update
   */
  async forceUpdate() {
    this.retryCount = 0;
    return this.updateRates();
  }

  /**
   * Clean up
   */
  cleanup() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    chrome.alarms.clear("updateExchangeRates");
  }
}

// Note: Instance will be created in background.js after bundling
