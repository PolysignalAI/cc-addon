/**
 * @jest-environment jsdom
 */

// Import the modules we need to test
import { PatternMatcher } from "../cc/src/modules/detection/PatternMatcher.js";
import { CurrencyDetector } from "../cc/src/modules/detection/CurrencyDetector.js";
import { PriceExtractor } from "../cc/src/modules/detection/PriceExtractor.js";
import {
  MULTI_CHAR_CURRENCY_SYMBOLS,
  EXTENSION_CLASSES,
} from "../cc/src/constants.js";

// Mock PriceConverter class to test the full flow
class MockPriceConverter {
  constructor() {
    this.patternMatcher = new PatternMatcher();
    this.currencyDetector = new CurrencyDetector();
    this.priceExtractor = new PriceExtractor();
    this.processedNodes = new WeakSet();
  }

  // Simplified version of processSplitPrices
  processSplitPrices(container) {
    const results = [];
    const currencyElements = container.querySelectorAll("span, div, sup");

    for (const element of currencyElements) {
      if (this.processedNodes.has(element)) continue;

      const text = element.textContent.trim();

      if (this.isCurrencySymbolOnly(text)) {
        const priceData = this.findAdjacentPrice(element, text);

        if (priceData) {
          results.push({
            currency: priceData.currency,
            price: priceData.price,
            elements: [element, ...priceData.priceElements],
          });

          // Mark as processed
          this.processedNodes.add(element);
          priceData.priceElements.forEach((elem) =>
            this.processedNodes.add(elem)
          );
        }
      }
    }

    return results;
  }

  isCurrencySymbolOnly(text) {
    const multiCharSymbols = Object.keys(MULTI_CHAR_CURRENCY_SYMBOLS);
    for (const symbol of multiCharSymbols) {
      if (text === symbol) return true;
    }

    const singleSymbols = [
      "$",
      "€",
      "£",
      "¥",
      "₹",
      "₩",
      "₺",
      "₽",
      "₴",
      "₪",
      "₦",
      "₵",
      "₨",
      "₫",
      "₱",
      "₡",
      "₸",
      "₮",
      "฿",
    ];
    return singleSymbols.includes(text);
  }

  findAdjacentPrice(currencyElement, currencySymbol) {
    const parent = currencyElement.parentElement;
    if (!parent) return null;

    const siblings = Array.from(parent.children);
    const currencyIndex = siblings.indexOf(currencyElement);

    let priceText = "";
    let priceElements = [];
    let hasDecimalPoint = false;

    for (let i = currencyIndex + 1; i < siblings.length; i++) {
      const sibling = siblings[i];
      const text = sibling.textContent.trim();

      // Handle various price parts
      if (/^[\d,]+$/.test(text)) {
        // For cases where we have two adjacent number spans (like <span>99</span><span>99</span>)
        // If we already have digits and this is exactly 2 digits, treat as cents
        if (
          priceText &&
          /^\d+$/.test(priceText) &&
          text.length === 2 &&
          /^\d{2}$/.test(text) &&
          !hasDecimalPoint
        ) {
          priceText += "." + text;
          priceElements.push(sibling);
          hasDecimalPoint = true;
        } else {
          // Regular digits
          priceText += text;
          priceElements.push(sibling);
        }
      } else if (text === ".") {
        // Decimal point
        priceText += text;
        priceElements.push(sibling);
        hasDecimalPoint = true;
      } else if (
        sibling.classList?.contains("a-price-decimal") &&
        sibling.textContent === "."
      ) {
        // Amazon-specific decimal point
        priceText += ".";
        priceElements.push(sibling);
        hasDecimalPoint = true;
      } else if (sibling.classList?.contains("a-price-whole")) {
        // Amazon-specific whole price (may contain nested elements)
        const wholeText = this.extractTextFromElement(sibling, [
          "a-price-decimal",
        ]);
        priceText += wholeText;
        priceElements.push(sibling);

        // Check if there's a nested decimal point
        const decimalElement = sibling.querySelector(".a-price-decimal");
        if (decimalElement) {
          priceText += ".";
          hasDecimalPoint = true;
        }
      } else if (sibling.classList?.contains("a-price-fraction")) {
        // Amazon-specific fraction
        if (!hasDecimalPoint && priceText) {
          priceText += ".";
        }
        priceText += text;
        priceElements.push(sibling);
        break; // Stop after fraction
      } else if (sibling.tagName === "SUP" && /^\d{2}$/.test(text)) {
        // Superscript cents
        if (!hasDecimalPoint && priceText) {
          priceText += ".";
        }
        priceText += text;
        priceElements.push(sibling);
        break;
      } else {
        // Check if this could be a full price (like "1,234.56")
        if (/^[\d,]+(?:\.\d+)?$/.test(text)) {
          priceText = text;
          priceElements.push(sibling);
          break; // Found complete price
        }
        // Unknown element, stop processing
        break;
      }
    }

    if (priceText && /\d/.test(priceText)) {
      const price = this.priceExtractor.extractPrice(priceText);
      const currency = this.currencyDetector.extractCurrency(
        currencySymbol + priceText
      );

      if (price && price > 0) {
        return {
          price,
          currency,
          priceElements,
          fullText: currencySymbol + priceText,
        };
      }
    }

    return null;
  }

  extractTextFromElement(element, excludeClasses = []) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const shouldExclude = excludeClasses.some((cls) =>
          node.classList?.contains(cls)
        );
        if (!shouldExclude) {
          text += this.extractTextFromElement(node, excludeClasses);
        }
      }
    }
    return text;
  }
}

describe("HTML Integration Tests", () => {
  let priceConverter;

  beforeEach(() => {
    priceConverter = new MockPriceConverter();
  });

  describe("Amazon-style split prices", () => {
    test("should detect Amazon price with nested decimal point", () => {
      document.body.innerHTML = `
        <span aria-hidden="true">
          <span class="a-price-symbol">$</span>
          <span class="a-price-whole">349<span class="a-price-decimal">.</span></span>
          <span class="a-price-fraction">00</span>
        </span>
      `;

      const results = priceConverter.processSplitPrices(document.body);

      expect(results).toHaveLength(1);
      expect(results[0].currency).toBe("USD");
      expect(results[0].price).toBe(349.0);
    });

    test("should detect Amazon price without decimal in whole", () => {
      document.body.innerHTML = `
        <span aria-hidden="true">
          <span class="a-price-symbol">$</span>
          <span class="a-price-whole">99</span>
          <span class="a-price-fraction">99</span>
        </span>
      `;

      const results = priceConverter.processSplitPrices(document.body);

      expect(results).toHaveLength(1);
      expect(results[0].currency).toBe("USD");
      expect(results[0].price).toBe(99.99);
    });

    test("should detect multi-currency Amazon prices", () => {
      document.body.innerHTML = `
        <div>
          <span class="a-price-symbol">CA$</span>
          <span class="a-price-whole">1,234<span class="a-price-decimal">.</span></span>
          <span class="a-price-fraction">56</span>
        </div>
      `;

      const results = priceConverter.processSplitPrices(document.body);

      expect(results).toHaveLength(1);
      expect(results[0].currency).toBe("CAD");
      expect(results[0].price).toBe(1234.56);
    });
  });

  describe("Superscript prices", () => {
    test("should detect price with superscript cents", () => {
      document.body.innerHTML = `
        <span>
          <span>$</span>
          <span>99</span>
          <sup>99</sup>
        </span>
      `;

      const results = priceConverter.processSplitPrices(document.body);

      expect(results).toHaveLength(1);
      expect(results[0].currency).toBe("USD");
      expect(results[0].price).toBe(99.99);
    });

    test("should detect AUD price with superscript", () => {
      document.body.innerHTML = `
        <div>
          <span>AU$</span>
          <span>19</span>
          <sup>99</sup>
        </div>
      `;

      const results = priceConverter.processSplitPrices(document.body);

      expect(results).toHaveLength(1);
      expect(results[0].currency).toBe("AUD");
      expect(results[0].price).toBe(19.99);
    });
  });

  describe("Split prices with spaces", () => {
    test("should detect split price with space between elements", () => {
      document.body.innerHTML = `
        <div>
          <span>A$</span>
          <span>1,234.56</span>
        </div>
      `;

      const results = priceConverter.processSplitPrices(document.body);

      expect(results).toHaveLength(1);
      expect(results[0].currency).toBe("AUD");
      expect(results[0].price).toBe(1234.56);
    });
  });

  describe("Edge cases", () => {
    test("should handle multiple prices in container", () => {
      document.body.innerHTML = `
        <div>
          <span class="price1">
            <span>$</span><span>10</span><span>99</span>
          </span>
          <span class="price2">
            <span>€</span><span>8</span><span>99</span>
          </span>
        </div>
      `;

      const results = priceConverter.processSplitPrices(document.body);

      expect(results).toHaveLength(2);
      expect(results[0].price).toBe(10.99);
      expect(results[0].currency).toBe("USD");
      expect(results[1].price).toBe(8.99);
      expect(results[1].currency).toBe("EUR");
    });

    test("should not process already processed elements", () => {
      document.body.innerHTML = `
        <span>
          <span>$</span><span>99</span><span>99</span>
        </span>
      `;

      const results1 = priceConverter.processSplitPrices(document.body);
      const results2 = priceConverter.processSplitPrices(document.body);

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(0); // Should not process again
    });
  });
});
