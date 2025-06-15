/**
 * Currency Detection Utility
 * Auto-detects base currency from browser timezone and locale settings
 */

import {
  LOCALE_CURRENCY_MAP,
  LANGUAGE_CURRENCY_MAP,
  TIMEZONE_CURRENCY_MAP,
  COUNTRY_CURRENCY_MAP,
  DEFAULT_SETTINGS,
} from "./constants.js";

class CurrencyDetector {
  constructor() {
    this.baseCurrency = DEFAULT_SETTINGS.baseCurrency;
  }

  /**
   * Detect the most appropriate base currency for the user
   * @returns {string} Currency code (e.g., 'USD', 'EUR', 'GBP')
   */
  detectBaseCurrency() {
    // Try locale-based detection first
    const localeCurrency = this.detectFromLocale();
    if (localeCurrency) {
      this.baseCurrency = localeCurrency;
      return localeCurrency;
    }

    // Try timezone-based detection
    const timezoneCurrency = this.detectFromTimezone();
    if (timezoneCurrency) {
      this.baseCurrency = timezoneCurrency;
      return timezoneCurrency;
    }

    // Try language-based detection
    const languageCurrency = this.detectFromLanguage();
    if (languageCurrency) {
      this.baseCurrency = languageCurrency;
      return languageCurrency;
    }

    // Try country-based detection
    const countryCurrency = this.detectFromCountry();
    if (countryCurrency) {
      this.baseCurrency = countryCurrency;
      return countryCurrency;
    }

    return this.baseCurrency;
  }

  /**
   * Detect currency from browser locale
   */
  detectFromLocale() {
    const locale = navigator.language || navigator.userLanguage;
    return LOCALE_CURRENCY_MAP[locale] || null;
  }

  /**
   * Detect currency from timezone
   */
  detectFromTimezone() {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return TIMEZONE_CURRENCY_MAP[timezone] || null;
    } catch (error) {
      console.warn("Timezone detection failed:", error);
      return null;
    }
  }

  /**
   * Detect currency from language preference
   */
  detectFromLanguage() {
    const language = navigator.language.split("-")[0];
    return LANGUAGE_CURRENCY_MAP[language] || null;
  }

  detectFromCountry() {
    try {
      const locale = navigator.language || navigator.userLanguage;
      const country = locale.split("-")[1];
      return COUNTRY_CURRENCY_MAP[country] || null;
    } catch (error) {
      console.warn("Country detection failed:", error);
      return null;
    }
  }

  /**
   * Get detailed detection information for debugging
   */
  getDetectionInfo() {
    const info = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
      languages: navigator.languages,
      detectedCurrency: this.detectBaseCurrency(),
    };

    console.log("🌍 Currency Detection Info:", info);
    return info;
  }
}

// Export for use in extension
if (typeof window !== "undefined") {
  window.CurrencyDetector = CurrencyDetector;
}

// Export for Node.js if available
if (typeof module !== "undefined" && module.exports) {
  module.exports = CurrencyDetector;
}
