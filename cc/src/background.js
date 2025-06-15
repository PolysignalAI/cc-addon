import {
  SUPPORTED_FIAT_CURRENCIES,
  SUPPORTED_CRYPTO_CURRENCIES,
  FIAT_CURRENCY_NAMES,
  CRYPTO_SYMBOL_TO_NAME,
  COINGECKO_ID_TO_SYMBOL,
  SYMBOL_TO_COINGECKO_ID,
  API_ENDPOINTS,
  DEFAULT_SETTINGS,
} from "./constants.js";

class ExchangeRateService {
  constructor() {
    this.lastUpdateTime = null;
    this.fiatRates = {};
    this.cryptoRates = {};
    this.syncInProgress = false;
    this.errorState = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.baseBackoffMs = 1000;
    this.updateIntervalMs = 5 * 60 * 1000; // 5 minutes

    this.init();
  }

  async init() {
    // Check if we need to sync on startup
    await this.checkAndSync();

    // Set up alarm for periodic updates
    this.setupPeriodicUpdates();
  }

  async checkAndSync() {
    try {
      const storage = await chrome.storage.local.get([
        "lastUpdateTime",
        "fiatRates",
        "cryptoRates",
      ]);

      this.lastUpdateTime = storage.lastUpdateTime;
      this.fiatRates = storage.fiatRates || {};
      this.cryptoRates = storage.cryptoRates || {};

      const now = Date.now();
      const shouldSync =
        !this.lastUpdateTime ||
        now - this.lastUpdateTime > this.updateIntervalMs;

      if (shouldSync) {
        console.log("Exchange rates need syncing, starting sync...");
        await this.syncRates();
      } else {
        console.log("Exchange rates are up to date");
      }
    } catch (error) {
      console.error("Error checking sync status:", error);
      await this.syncRates();
    }
  }

  setupPeriodicUpdates() {
    // Create alarm for updates every 5 minutes
    chrome.alarms.create("syncExchangeRates", {
      delayInMinutes: 5,
      periodInMinutes: 5,
    });

    // Listen for alarm
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "syncExchangeRates") {
        this.syncRates();
      }
    });
  }

  async syncRates() {
    if (this.syncInProgress) {
      console.log("Sync already in progress, skipping...");
      return;
    }

    this.syncInProgress = true;
    console.log("Starting exchange rate sync...");

    try {
      // Fetch both fiat and crypto rates concurrently
      const [fiatRates, cryptoRates] = await Promise.all([
        this.fetchFiatRates(),
        this.fetchCryptoRates(),
      ]);

      this.fiatRates = fiatRates;
      this.cryptoRates = cryptoRates;
      this.lastUpdateTime = Date.now();
      this.errorState = false;
      this.retryCount = 0;

      // Save to storage
      await chrome.storage.local.set({
        lastUpdateTime: this.lastUpdateTime,
        fiatRates: this.fiatRates,
        cryptoRates: this.cryptoRates,
        errorState: false,
      });

      console.log("Exchange rate sync completed successfully");
    } catch (error) {
      console.error("Error syncing exchange rates:", error);
      await this.handleSyncError();
    } finally {
      this.syncInProgress = false;
    }
  }

  async fetchFiatRates() {
    const url = `${API_ENDPOINTS.FRANKFURTER}?base=USD`;
    console.log("Fetching fiat rates from:", url);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Received fiat rates:", data);

    // Add USD rate (base currency)
    const rates = { USD: 1, ...data.rates };

    // Filter to only supported currencies
    const filteredRates = {};
    for (const currency of SUPPORTED_FIAT_CURRENCIES) {
      if (rates[currency] !== undefined) {
        filteredRates[currency] = rates[currency];
      }
    }

    return filteredRates;
  }

  async fetchCryptoRates() {
    // Build CoinGecko API URL
    const coinIds = Object.keys(COINGECKO_ID_TO_SYMBOL).join(",");
    const url = `${API_ENDPOINTS.COINGECKO}?ids=${coinIds}&vs_currencies=usd`;
    console.log("Fetching crypto rates from:", url);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Received crypto rates:", data);

    // Convert CoinGecko format to our format (USD -> crypto rate)
    // CoinGecko gives us 1 BTC = 45000 USD, we need 1 USD = X BTC
    const rates = {};
    for (const [coinId, priceData] of Object.entries(data)) {
      const symbol = COINGECKO_ID_TO_SYMBOL[coinId];
      if (symbol && priceData.usd) {
        rates[symbol] = 1 / priceData.usd; // Convert to USD->Crypto rate
      }
    }

    return rates;
  }

  async handleSyncError() {
    this.retryCount++;

    if (this.retryCount <= this.maxRetries) {
      const backoffMs = this.baseBackoffMs * Math.pow(2, this.retryCount - 1);
      console.log(
        `Sync failed, retrying in ${backoffMs}ms (attempt ${this.retryCount}/${this.maxRetries})`
      );

      setTimeout(() => {
        this.syncRates();
      }, backoffMs);
    } else {
      console.error("Max retries exceeded, setting error state");
      this.errorState = true;
      await chrome.storage.local.set({ errorState: true });
    }
  }

  // Convert between any two currencies using USD as base
  convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    // Get USD rates for both currencies (all stored as USD→Currency)
    const fromRate = this.getUsdRate(fromCurrency);
    const toRate = this.getUsdRate(toCurrency);

    if (fromRate === null || toRate === null) {
      return null;
    }

    // Convert: (amount / fromRate) * toRate = amount * (toRate / fromRate)
    // Example: 1 EUR to BTC with EUR=0.85, BTC=0.0000222
    // = (1 / 0.85) * 0.0000222 = 1 * (0.0000222 / 0.85) = 0.0000261 BTC
    return amount * (toRate / fromRate);
  }

  getUsdRate(currency) {
    // USD is always 1
    if (currency === "USD") {
      return 1;
    }

    // Special case for BTC_SATS - use BTC rate
    if (currency === "BTC_SATS") {
      return this.cryptoRates["BTC"] || null;
    }

    // Check fiat rates
    if (this.fiatRates[currency] !== undefined) {
      return this.fiatRates[currency];
    }

    // Check crypto rates
    if (this.cryptoRates[currency] !== undefined) {
      return this.cryptoRates[currency];
    }

    return null;
  }

  // Get all rates for conversion
  getAllRates() {
    return {
      fiat: this.fiatRates,
      crypto: this.cryptoRates,
      lastUpdate: this.lastUpdateTime,
      errorState: this.errorState,
    };
  }

  // Check if currency is crypto
  isCrypto(currency) {
    return SUPPORTED_CRYPTO_CURRENCIES.includes(currency);
  }

  // Get currency display name
  getCurrencyName(currency) {
    return (
      FIAT_CURRENCY_NAMES[currency] ||
      CRYPTO_SYMBOL_TO_NAME[currency] ||
      currency
    );
  }
}

// Initialize service
const exchangeService = new ExchangeRateService();

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getRates") {
    const rates = exchangeService.getAllRates();
    sendResponse(rates);
  } else if (request.action === "convertCurrency") {
    const { amount, fromCurrency, toCurrency } = request;
    const result = exchangeService.convertCurrency(
      amount,
      fromCurrency,
      toCurrency
    );
    sendResponse({ result });
  } else if (request.action === "forceSync") {
    exchangeService
      .syncRates()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (request.action === "getCurrencyName") {
    const name = exchangeService.getCurrencyName(request.currency);
    sendResponse({ name });
  }
});

console.log("Exchange rate background service initialized");
