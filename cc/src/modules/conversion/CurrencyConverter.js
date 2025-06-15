import {
  CURRENCY_SYMBOLS,
  SUPPORTED_CRYPTO_CURRENCIES,
  NO_DECIMAL_CURRENCIES,
  debug,
} from "../../constants.js";

/**
 * Handles currency conversion calculations and formatting
 */
export class CurrencyConverter {
  constructor() {
    this.exchangeRates = {};
    this.baseCurrency = "USD";
    this.btcDenomination = "btc";
  }

  /**
   * Set exchange rates
   */
  setRates(rates) {
    this.exchangeRates = rates;
  }

  /**
   * Set base currency
   */
  setBaseCurrency(currency) {
    this.baseCurrency = currency;
  }

  /**
   * Set BTC denomination preference
   */
  setBtcDenomination(denomination) {
    this.btcDenomination = denomination;
  }

  /**
   * Calculate conversions for a price
   */
  calculateConversions(amount, fromCurrency, toCurrencies) {
    const conversions = [];

    // Always add the source currency first
    conversions.push({
      currency: fromCurrency,
      amount: amount,
      symbol: this.getCurrencySymbol(fromCurrency),
      formatted: this.formatCurrency(amount, fromCurrency),
    });

    // Then add selected currencies (skip if it's the same as source)
    for (const toCurrency of toCurrencies) {
      if (toCurrency === fromCurrency) continue;
      try {
        const converted = this.convert(amount, fromCurrency, toCurrency);
        if (converted !== null) {
          conversions.push({
            currency: toCurrency,
            amount: converted,
            symbol: this.getCurrencySymbol(toCurrency),
            formatted: this.formatCurrency(converted, toCurrency),
          });
        }
      } catch (error) {
        debug.error(
          `Conversion error ${fromCurrency} to ${toCurrency}:`,
          error
        );
      }
    }

    return conversions;
  }

  /**
   * Convert amount from one currency to another
   */
  convert(amount, from, to) {
    if (!amount || !from || !to) return null;
    if (from === to) return amount;

    // Get rates in USD
    const fromRate = this.getUsdRate(from);
    const toRate = this.getUsdRate(to);

    if (!fromRate || !toRate) {
      debug.warn(`Missing rates: ${from}=${fromRate}, ${to}=${toRate}`);
      return null;
    }

    // Convert through USD
    const usdAmount = amount / fromRate;
    const convertedAmount = usdAmount * toRate;

    return convertedAmount;
  }

  /**
   * Get USD conversion rate for a currency
   */
  getUsdRate(currency) {
    if (currency === "USD") return 1;

    // Handle BTC Satoshis
    if (currency === "BTC_SATS") {
      const btcRate = this.exchangeRates["BTC"];
      return btcRate ? btcRate * 100000000 : null;
    }

    const rate = this.exchangeRates[currency];
    if (!rate) {
    }
    return rate || null;
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount, currency) {
    if (amount === null || amount === undefined) return "—";

    // Special handling for cryptocurrencies
    if (SUPPORTED_CRYPTO_CURRENCIES.includes(currency)) {
      return this.formatCrypto(amount, currency);
    }

    // Format fiat currencies
    return this.formatFiat(amount, currency);
  }

  /**
   * Format fiat currency
   */
  formatFiat(amount, currency) {
    // Determine decimal places
    let decimals = 2;
    if (amount < 1) {
      decimals = 4;
    } else if (amount >= 1000000) {
      decimals = 0;
    }

    // Format number
    const formatted = this.formatNumber(amount, decimals);

    // Some currencies don't use decimals
    if (NO_DECIMAL_CURRENCIES.includes(currency) && amount > 100) {
      return this.formatNumber(Math.round(amount), 0);
    }

    return formatted;
  }

  /**
   * Format cryptocurrency
   */
  formatCrypto(amount, currency) {
    if (currency === "BTC") {
      return this.formatBitcoin(amount);
    }

    // For other cryptos, use appropriate decimals
    let decimals = 8;
    if (amount >= 1) {
      decimals = 4;
    } else if (amount >= 0.01) {
      decimals = 6;
    }

    return this.formatNumber(amount, decimals);
  }

  /**
   * Format Bitcoin based on denomination preference
   */
  formatBitcoin(amount) {
    switch (this.btcDenomination) {
      case "btc":
        return this.formatNumber(amount, amount < 0.01 ? 8 : 6);

      case "sats":
        const sats = amount * 100000000;
        return this.formatNumber(sats, 0) + " sats";

      case "dynamic":
        if (amount < 0.0001) {
          const sats = amount * 100000000;
          return this.formatNumber(sats, 0) + " sats";
        } else {
          return this.formatNumber(amount, amount < 0.01 ? 8 : 6);
        }

      default:
        return this.formatNumber(amount, 8);
    }
  }

  /**
   * Format number with thousand separators
   */
  formatNumber(number, decimals = 2) {
    // Round to specified decimals
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(number * factor) / factor;

    // Split into integer and decimal parts
    const parts = rounded.toString().split(".");

    // Add thousand separators
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Ensure correct decimal places
    if (decimals > 0) {
      if (parts[1]) {
        parts[1] = parts[1].padEnd(decimals, "0").substring(0, decimals);
      } else {
        parts[1] = "0".repeat(decimals);
      }
      return parts.join(".");
    }

    return parts[0];
  }

  /**
   * Get currency symbol
   */
  getCurrencySymbol(currency) {
    // Handle special cases
    if (currency === "BTC_SATS") {
      return "";
    }

    // Check if currency has a symbol
    const symbol = CURRENCY_SYMBOLS[currency];
    if (symbol) {
      return symbol;
    }

    // For currencies without symbols, return the code
    return currency + " ";
  }

  /**
   * Check if conversion is possible
   */
  canConvert(from, to) {
    if (from === to) return true;

    const fromRate = this.getUsdRate(from);
    const toRate = this.getUsdRate(to);

    return fromRate !== null && toRate !== null;
  }

  /**
   * Get available currencies for conversion
   */
  getAvailableCurrencies() {
    return Object.keys(this.exchangeRates).filter(
      (currency) => this.exchangeRates[currency] !== null
    );
  }

  /**
   * Calculate percentage change
   */
  calculatePercentageChange(oldAmount, newAmount) {
    if (!oldAmount || oldAmount === 0) return 0;
    return ((newAmount - oldAmount) / oldAmount) * 100;
  }
}
