import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../../constants.js";
import { debug } from "../../constants.js";

// Ensure chrome API is available (Firefox compatibility)
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  window.chrome = browser;
}

/**
 * Manages extension settings and Chrome storage
 */
export class Settings {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
  }

  /**
   * Load settings from Chrome storage
   */
  async load() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEYS, (result) => {
        // Merge with defaults
        this.settings = {
          baseCurrency: result.baseCurrency || DEFAULT_SETTINGS.baseCurrency,
          selectedCurrencies:
            result.selectedCurrencies || DEFAULT_SETTINGS.selectedCurrencies,
          favoriteCurrencies:
            result.favoriteCurrencies || DEFAULT_SETTINGS.favoriteCurrencies,
          disabledUrls: result.disabledUrls || [],
          appearance: {
            ...DEFAULT_SETTINGS.appearance,
            ...(result.appearance || {}),
          },
          extensionEnabled:
            result.extensionEnabled !== undefined
              ? result.extensionEnabled
              : true,
          btcDenomination: result.btcDenomination || "btc",
          exchangeRates: result.exchangeRates || {},
          lastUpdated: result.lastUpdated || null,
        };

        this.notifyListeners();
        resolve(this.settings);
      });
    });
  }

  /**
   * Save settings to Chrome storage
   */
  async save(updates) {
    return new Promise((resolve) => {
      // Update local settings FIRST
      this.settings = { ...this.settings, ...updates };

      // Save to storage
      chrome.storage.sync.set(updates, () => {
        // Don't notify listeners here - it causes cascading updates
        resolve();
      });
    });
  }

  /**
   * Get a specific setting
   */
  get(key) {
    return this.settings[key];
  }

  /**
   * Set a specific setting
   */
  async set(key, value) {
    await this.save({ [key]: value });
  }

  /**
   * Get all settings
   */
  getAll() {
    return { ...this.settings };
  }

  /**
   * Check if URL is disabled
   */
  isUrlDisabled(url) {
    const disabledUrls = this.settings.disabledUrls || [];

    return disabledUrls.some((pattern) => {
      try {
        // Support both simple string matching and regex patterns
        if (pattern.startsWith("/") && pattern.endsWith("/")) {
          // Regex pattern
          const regex = new RegExp(pattern.slice(1, -1));
          return regex.test(url);
        } else {
          // Simple string matching
          return url.includes(pattern);
        }
      } catch (e) {
        debug.error("Invalid URL pattern:", pattern, e);
        return false;
      }
    });
  }

  /**
   * Check if extension is enabled
   */
  isEnabled() {
    return this.settings.extensionEnabled;
  }

  /**
   * Add settings change listener
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove settings change listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of settings change
   */
  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.settings);
      } catch (e) {
        debug.error("Error in settings listener:", e);
      }
    }
  }

  /**
   * Get base currency
   */
  getBaseCurrency() {
    return this.settings.baseCurrency;
  }

  /**
   * Get selected currencies
   */
  getSelectedCurrencies() {
    return this.settings.selectedCurrencies;
  }

  /**
   * Get appearance settings
   */
  getAppearance() {
    return this.settings.appearance;
  }

  /**
   * Get BTC denomination preference
   */
  getBtcDenomination() {
    return this.settings.btcDenomination;
  }

  /**
   * Get exchange rates
   */
  getExchangeRates() {
    return this.settings.exchangeRates;
  }

  /**
   * Get last updated time
   */
  getLastUpdated() {
    return this.settings.lastUpdated;
  }

  /**
   * Reset to defaults
   */
  async reset() {
    await this.save(DEFAULT_SETTINGS);
  }
}
