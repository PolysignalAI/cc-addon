import {
  ALL_SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CURRENCY_META_SELECTORS,
  PAGE_CURRENCY_PATTERNS,
  MULTI_CHAR_CURRENCY_SYMBOLS,
  MULTI_CURRENCY_SYMBOLS,
} from "../../constants.js";

/**
 * Handles all currency detection logic
 * Extracted from the monolithic content.js to improve maintainability
 */
export class CurrencyDetector {
  constructor() {
    this.pageCurrency = null;
    this.currencyCache = new Map();
  }

  /**
   * Detect currency from text with multi-character symbols
   * Handles patterns like C$, A$, AU$, etc.
   */
  detectMultiCharSymbol(text) {
    // Check all multi-character symbols
    for (const [symbol, currency] of Object.entries(
      MULTI_CHAR_CURRENCY_SYMBOLS
    )) {
      if (text.includes(symbol)) {
        return currency;
      }

      // Also check with space (e.g., "CA $")
      const spacePattern = symbol.replace("$", "\\s*\\$");
      if (text.match(new RegExp(spacePattern))) {
        return currency;
      }
    }

    return null;
  }

  /**
   * Detect currency from specific patterns (yen/yuan, krona, etc.)
   */
  detectSpecificPatterns(text) {
    // Check for R$ (Brazilian Real) first
    if (text.includes("R$")) return "BRL";

    // South African Rand
    if (text.match(/^R\s*[\d,]/)) return "ZAR";
    if (text.match(/^R[\d,]/)) return "ZAR";

    // Indian Rupees
    if (text.match(/\bRs\./)) return "INR";

    // Yen/Yuan specific patterns
    if (text.match(/JP\s*¥/) || text.match(/JPY\s*¥/)) return "JPY";
    if (
      text.match(/CN\s*¥/) ||
      text.match(/CNY\s*¥/) ||
      text.includes("RMB") ||
      text.includes("元")
    )
      return "CNY";

    // Krona specific patterns
    if (text.match(/SEK\s*kr/i)) return "SEK";
    if (text.match(/NOK\s*kr/i)) return "NOK";
    if (text.match(/DKK\s*kr/i)) return "DKK";
    if (text.match(/ISK\s*kr/i)) return "ISK";

    // Bitcoin symbol
    if (text.includes("₿")) return "BTC";

    return null;
  }

  /**
   * Detect cryptocurrency codes
   */
  detectCryptoCurrency(text) {
    const cryptoMatch = text.match(
      /\b(BTC|ETH|BNB|XRP|SOL|DOGE|TRX|ADA|BCH|XLM|LTC|DOT|XMR|PEPE|AAVE|PI|CRO|TRUMP|VET|RENDER|WLD)\b/i
    );
    return cryptoMatch ? cryptoMatch[1].toUpperCase() : null;
  }

  /**
   * Detect standard currency codes
   */
  detectCurrencyCode(text) {
    const currencyMatch = text.match(
      /\b(AUD|USD|EUR|GBP|CAD|NZD|SGD|HKD|CHF|JPY|CNY|INR|KRW|MXN|BRL|ZAR|NOK|SEK|DKK|PLN|CZK|HUF|RON|BGN|TRY|ILS|THB|MYR|IDR|PHP|ISK)\b/i
    );
    return currencyMatch ? currencyMatch[1].toUpperCase() : null;
  }

  /**
   * Detect currency from single-character symbols
   */
  detectFromSymbol(text) {
    const symbolMap = {
      "€": "EUR",
      "£": "GBP",
      "¥": "JPY", // Default to JPY, context will override if needed
      $: "USD", // Default to USD, context will override if needed
      "₹": "INR",
      "₩": "KRW",
      "₺": "TRY",
      "₽": "RUB",
      "₴": "UAH",
      "₪": "ILS",
      "₦": "NGN",
      "₵": "GHS",
      "₨": "PKR",
      "৳": "BDT",
      "₫": "VND",
      "₱": "PHP",
      "₡": "CRC",
      "₸": "KZT",
      "₮": "MNT",
      "฿": "THB",
      kr: "SEK", // Default to SEK, context will override if needed
      zł: "PLN",
      Kč: "CZK",
      Ft: "HUF",
      lei: "RON",
      лв: "BGN",
    };

    for (const [symbol, currency] of Object.entries(symbolMap)) {
      if (text.includes(symbol)) {
        return currency;
      }
    }

    return null;
  }

  /**
   * Main currency extraction method
   * Replaces the 116-line extractCurrency method with a cleaner approach
   */
  extractCurrency(priceText, textNode = null) {
    // Try multi-character symbols first (most specific)
    let currency = this.detectMultiCharSymbol(priceText);
    if (currency) return currency;

    // Try specific patterns
    currency = this.detectSpecificPatterns(priceText);
    if (currency) return currency;

    // Try cryptocurrency
    currency = this.detectCryptoCurrency(priceText);
    if (currency) return currency;

    // Try standard currency codes
    currency = this.detectCurrencyCode(priceText);
    if (currency) return currency;

    // Try single-character symbols last (least specific)
    currency = this.detectFromSymbol(priceText);
    if (currency) return currency;

    // If we have a text node, try to detect from context
    if (textNode) {
      currency = this.detectFromContext(textNode, priceText);
      if (currency) return currency;
    }

    // Return page currency or default
    return this.pageCurrency || "USD";
  }

  /**
   * Detect currency from surrounding context
   */
  detectFromContext(textNode, priceText) {
    // Check cache first
    const cacheKey = `${textNode.textContent}_${priceText}`;
    if (this.currencyCache.has(cacheKey)) {
      return this.currencyCache.get(cacheKey);
    }

    // Look for currency in nearby text
    const nearbyText = this.getNearbyText(textNode);

    // Try all detection methods on nearby text
    let currency =
      this.detectCurrencyCode(nearbyText) ||
      this.detectMultiCharSymbol(nearbyText) ||
      this.detectSpecificPatterns(nearbyText);

    // Cache the result
    if (currency) {
      this.currencyCache.set(cacheKey, currency);
    }

    return currency;
  }

  /**
   * Get text from nearby elements for context
   */
  getNearbyText(node) {
    let nearbyText = "";
    let parent = node.parentElement;
    let depth = 0;

    while (parent && depth < 3) {
      // Look at previous siblings
      let sibling = parent.previousElementSibling;
      if (sibling && sibling.textContent) {
        nearbyText += " " + sibling.textContent;
      }

      // Look at next siblings
      sibling = parent.nextElementSibling;
      if (sibling && sibling.textContent) {
        nearbyText += " " + sibling.textContent;
      }

      // Look at parent's text
      if (parent.textContent) {
        nearbyText += " " + parent.textContent;
      }

      parent = parent.parentElement;
      depth++;
    }

    return nearbyText;
  }

  /**
   * Detect page's primary currency from meta tags, structured data, etc.
   */
  detectPageCurrency() {
    // Try meta tags
    const metaCurrency = this.detectFromMetaTags();
    if (metaCurrency) {
      this.pageCurrency = metaCurrency;
      return metaCurrency;
    }

    // Try structured data
    const structuredCurrency = this.detectFromStructuredData();
    if (structuredCurrency) {
      this.pageCurrency = structuredCurrency;
      return structuredCurrency;
    }

    // Try common patterns in page text
    const textCurrency = this.detectFromPageText();
    if (textCurrency) {
      this.pageCurrency = textCurrency;
      return textCurrency;
    }

    return null;
  }

  /**
   * Detect currency from meta tags
   */
  detectFromMetaTags() {
    for (const selector of CURRENCY_META_SELECTORS) {
      const meta = document.querySelector(selector);
      if (meta) {
        const content =
          meta.getAttribute("content") || meta.getAttribute("value");
        if (content && this.isValidCurrency(content)) {
          return content.toUpperCase();
        }
      }
    }

    return null;
  }

  /**
   * Detect currency from structured data
   */
  detectFromStructuredData() {
    // Check for JSON-LD
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const currency = this.extractCurrencyFromJsonLd(data);
        if (currency) return currency;
      } catch (e) {
        // Invalid JSON, skip
      }
    }

    // Check for microdata
    const microdataElements = document.querySelectorAll(
      '[itemprop="priceCurrency"]'
    );
    for (const element of microdataElements) {
      const currency = element.getAttribute("content") || element.textContent;
      if (currency && this.isValidCurrency(currency)) {
        return currency.toUpperCase();
      }
    }

    return null;
  }

  /**
   * Extract currency from JSON-LD data
   */
  extractCurrencyFromJsonLd(data) {
    if (!data) return null;

    // Direct currency property
    if (data.priceCurrency && this.isValidCurrency(data.priceCurrency)) {
      return data.priceCurrency.toUpperCase();
    }

    // Check offers
    if (data.offers) {
      const offers = Array.isArray(data.offers) ? data.offers : [data.offers];
      for (const offer of offers) {
        if (offer.priceCurrency && this.isValidCurrency(offer.priceCurrency)) {
          return offer.priceCurrency.toUpperCase();
        }
      }
    }

    // Recursively check nested objects
    for (const value of Object.values(data)) {
      if (typeof value === "object") {
        const currency = this.extractCurrencyFromJsonLd(value);
        if (currency) return currency;
      }
    }

    return null;
  }

  /**
   * Detect currency from page text patterns
   */
  detectFromPageText() {
    const textContent = (document.body.textContent || "").substring(0, 1000);
    for (const pattern of PAGE_CURRENCY_PATTERNS) {
      const match = textContent.match(pattern);
      if (match && this.isValidCurrency(match[1])) {
        return match[1].toUpperCase();
      }
    }

    return null;
  }

  /**
   * Validate currency code
   */
  isValidCurrency(code) {
    if (!code || typeof code !== "string") return false;
    return ALL_SUPPORTED_CURRENCIES.includes(code.toUpperCase());
  }

  /**
   * Map currency symbols to their codes
   */
  getCurrencyFromSymbol(symbol) {
    const symbolMap = {
      $: "USD",
      "€": "EUR",
      "£": "GBP",
      "¥": "JPY",
      C$: "CAD",
      CA$: "CAD",
      A$: "AUD",
      AU$: "AUD",
      NZ$: "NZD",
      HK$: "HKD",
      S$: "SGD",
      SG$: "SGD",
      US$: "USD",
      "₹": "INR",
      R$: "BRL",
      R: "ZAR",
      "₩": "KRW",
      kr: "SEK",
      zł: "PLN",
      Kč: "CZK",
      "₺": "TRY",
      "₽": "RUB",
      "₴": "UAH",
      "₪": "ILS",
      "₦": "NGN",
      "₵": "GHS",
      "₨": "PKR",
      "৳": "BDT",
      "₫": "VND",
      "₱": "PHP",
      "₡": "CRC",
      "₸": "KZT",
      "₮": "MNT",
      "฿": "THB",
      Ft: "HUF",
      lei: "RON",
      лв: "BGN",
      Rp: "IDR",
      RM: "MYR",
      Fr: "CHF",
    };

    return symbolMap[symbol] || null;
  }

  /**
   * Get all possible currencies for a symbol
   */
  getCurrenciesForSymbol(symbol) {
    return (
      MULTI_CURRENCY_SYMBOLS[symbol] ||
      [this.getCurrencyFromSymbol(symbol)].filter(Boolean)
    );
  }

  /**
   * Clear currency cache
   */
  clearCache() {
    this.currencyCache.clear();
  }
}
