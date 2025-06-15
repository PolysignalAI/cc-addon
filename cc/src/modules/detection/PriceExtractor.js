import { debug } from "../../constants.js";

/**
 * Handles price extraction from text
 * Cleanly separates numeric parsing logic from currency detection
 */
export class PriceExtractor {
  /**
   * Extract numeric price from text
   * Handles various formats: US (1,234.56), European (1.234,56), Indian (1,23,456)
   */
  extractPrice(priceText) {
    debug.log("extractPrice called with:", priceText);

    // First, remove any currency codes at the end (e.g., " HKD", " USD")
    let textWithoutCode = priceText.replace(
      /\s+(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|KRW|MXN|BRL|RUB|SGD|HKD|NZD|SEK|NOK|DKK|PLN|TRY|ZAR|ILS|CZK|HUF|RON|BGN|IDR|PHP|MYR|ISK)$/i,
      ""
    );

    debug.log("After removing currency code:", textWithoutCode);

    // Remove currency symbols and extract numeric value
    let cleanedText = textWithoutCode.replace(/[^0-9.,]/g, "");

    debug.log("After cleaning:", cleanedText);

    // If no digits found, return null
    if (!cleanedText || !cleanedText.match(/\d/)) {
      return null;
    }

    // Parse the number based on format
    const price = this.parseNumberFormat(cleanedText);
    return isNaN(price) ? null : price;
  }

  /**
   * Parse number based on detected format
   */
  parseNumberFormat(cleanedText) {
    const format = this.detectNumberFormat(cleanedText);

    switch (format) {
      case "european":
        // 1.234,56 -> remove dots, replace comma with dot
        return parseFloat(cleanedText.replace(/\./g, "").replace(",", "."));

      case "us":
        // 1,234.56 -> remove commas
        return parseFloat(cleanedText.replace(/,/g, ""));

      case "indian":
        // 1,23,456 -> remove all commas
        return parseFloat(cleanedText.replace(/,/g, ""));

      case "plain":
        // No separators
        return parseFloat(cleanedText);

      default:
        // Try to guess - if last separator is comma, treat as decimal
        const lastCommaIndex = cleanedText.lastIndexOf(",");
        const lastDotIndex = cleanedText.lastIndexOf(".");

        if (lastCommaIndex > lastDotIndex) {
          return parseFloat(cleanedText.replace(/\./g, "").replace(",", "."));
        } else {
          return parseFloat(cleanedText.replace(/,/g, ""));
        }
    }
  }

  /**
   * Detect number format from text
   */
  detectNumberFormat(text) {
    const dotCount = (text.match(/\./g) || []).length;
    const commaCount = (text.match(/,/g) || []).length;
    const lastDotIndex = text.lastIndexOf(".");
    const lastCommaIndex = text.lastIndexOf(",");

    // No separators
    if (commaCount === 0 && dotCount === 0) {
      return "plain";
    }

    // European format: dots for thousands, comma for decimal
    if (lastCommaIndex > lastDotIndex && lastCommaIndex > -1) {
      // Check if comma is followed by exactly 2 digits (decimal)
      const afterComma = text.substring(lastCommaIndex + 1);
      if (afterComma.length <= 2) {
        return "european";
      }
    }

    // US format: commas for thousands, dot for decimal
    if (lastDotIndex > lastCommaIndex && lastDotIndex > -1) {
      return "us";
    }

    // Indian format: specific comma pattern (1,23,456)
    if (commaCount > 0 && dotCount === 0) {
      const parts = text.split(",");
      if (parts.length > 2 && parts[parts.length - 2].length === 2) {
        return "indian";
      }
    }

    // Default to US format
    return "us";
  }

  /**
   * Extract price from element with split format (symbol in one element, number in others)
   */
  extractSplitPrice(containerElement) {
    const children = Array.from(containerElement.children);
    if (children.length < 2) return null;

    let symbolElement = null;
    let priceElements = [];

    // Find symbol and price elements
    for (const child of children) {
      const text = child.textContent.trim();

      // Check if this contains a currency symbol
      if (!symbolElement && this.containsCurrencySymbol(text)) {
        symbolElement = child;
      } else if (text.match(/^[\d,]+\.?\d*$/)) {
        priceElements.push(child);
      }
    }

    if (!symbolElement || priceElements.length === 0) return null;

    // Combine price elements
    const fullPriceText = priceElements
      .map((el) => el.textContent.trim())
      .join("");

    return {
      symbol: symbolElement.textContent.trim(),
      price: this.extractPrice(fullPriceText),
      elements: { symbolElement, priceElements },
    };
  }

  /**
   * Extract price from superscript format ($29<sup>99</sup>)
   */
  extractSuperscriptPrice(element) {
    const supElement = element.querySelector("sup");
    if (!supElement) return null;

    const mainText = element.textContent.replace(supElement.textContent, "");
    const supText = supElement.textContent;

    // Extract main price
    const mainMatch = mainText.match(/([$€£¥₹])\s*(\d+)/);
    if (!mainMatch) return null;

    // Combine main and superscript
    const fullPrice = mainMatch[2] + "." + supText;

    return {
      symbol: mainMatch[1],
      price: parseFloat(fullPrice),
      mainText: mainText,
      supText: supText,
    };
  }

  /**
   * Check if text contains a currency symbol
   */
  containsCurrencySymbol(text) {
    const symbolPattern =
      /^(A\$|AU\$|C\$|CA\$|NZ\$|S\$|HK\$|US\$|[$€£¥₹₽₺₩₦₵₨₫₱₡₸₮₴₪]+|kr|zł|Kč|Ft|lei|лв|R\$|R|Rp|RM|Fr)$/;
    return symbolPattern.test(text);
  }

  /**
   * Extract all prices from a text string
   */
  extractAllPrices(text) {
    const prices = [];

    // Simple pattern to find all number-like sequences
    const numberPattern = /[\d,]+\.?\d*/g;
    const matches = text.match(numberPattern);

    if (!matches) return prices;

    for (const match of matches) {
      const price = this.extractPrice(match);
      if (price && price > 0) {
        prices.push({
          text: match,
          value: price,
          index: text.indexOf(match),
        });
      }
    }

    return prices;
  }

  /**
   * Validate if a number is a reasonable price
   */
  isValidPrice(price) {
    if (!price || typeof price !== "number") return false;
    if (isNaN(price) || !isFinite(price)) return false;

    // Prices should be positive
    if (price <= 0) return false;

    // Extremely large numbers are probably not prices
    if (price > 1e9) return false;

    // Year-like numbers (1900-2100) are probably not prices
    if (price >= 1900 && price <= 2100 && price % 1 === 0) return false;

    return true;
  }

  /**
   * Format price for display
   */
  formatPrice(price, decimals = 2) {
    if (!this.isValidPrice(price)) return null;

    // For very small numbers (like crypto), use more decimals
    if (price < 0.01) {
      decimals = 6;
    } else if (price < 1) {
      decimals = 4;
    }

    return price.toFixed(decimals);
  }
}
