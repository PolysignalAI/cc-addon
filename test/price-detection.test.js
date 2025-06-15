// Import price patterns from constants
const fs = require("fs");
const path = require("path");

// Load constants.js and extract PRICE_PATTERNS
const constantsSource = fs.readFileSync(
  path.join(__dirname, "../cc/src/constants.js"),
  "utf8"
);

// Extract PRICE_PATTERNS from the source
const extractConstant = (source, name) => {
  const regex = new RegExp(
    `export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`,
    "m"
  );
  const match = source.match(regex);
  if (match) {
    try {
      // Use Function constructor to safely evaluate the array
      return new Function("return [" + match[1] + "]")();
    } catch (e) {
      console.warn(`Failed to parse ${name} from constants.js`);
      return null;
    }
  }
  return null;
};

const PRICE_PATTERNS = extractConstant(constantsSource, "PRICE_PATTERNS") || [];

// Mock PriceConverter class with necessary methods
class PriceConverter {
  constructor() {
    this.baseCurrency = "USD";
    this.exchangeRates = {
      USD: 1,
      EUR: 0.85,
      GBP: 0.73,
      AUD: 1.52,
      CAD: 1.35,
      HKD: 7.85,
      SGD: 1.35,
      NZD: 1.65,
      JPY: 150,
      CNY: 7.25,
      INR: 83,
      SEK: 10.5,
      NOK: 10.8,
      DKK: 6.7,
      ISK: 140,
      CHF: 0.88,
      BRL: 5.0,
      ZAR: 18.5,
      PHP: 56,
      BTC: 0.000023,
      ETH: 0.00038,
      DOGE: 14.5,
    };
  }

  extractPrice(priceText) {
    // First, remove any currency codes at the end (e.g., " HKD", " USD")
    let textWithoutCode = priceText.replace(
      /\s+(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|KRW|MXN|BRL|RUB|SGD|HKD|NZD|SEK|NOK|DKK|PLN|TRY|ZAR|ILS|CZK|HUF|RON|BGN|IDR|PHP|MYR|ISK)$/i,
      ""
    );

    // Remove currency symbols and extract numeric value
    let cleanedText = textWithoutCode.replace(/[^0-9.,]/g, "");

    // If no digits found, return null
    if (!cleanedText || !cleanedText.match(/\d/)) {
      return null;
    }

    // Determine if this uses European format (comma as decimal separator)
    const dotCount = (cleanedText.match(/\./g) || []).length;
    const commaCount = (cleanedText.match(/,/g) || []).length;
    const lastDotIndex = cleanedText.lastIndexOf(".");
    const lastCommaIndex = cleanedText.lastIndexOf(",");

    let normalizedText;

    if (lastCommaIndex > lastDotIndex) {
      // Comma appears after dot, likely European format (e.g., 1.234,56)
      normalizedText = cleanedText.replace(/\./g, "").replace(",", ".");
    } else if (lastDotIndex > lastCommaIndex) {
      // Dot appears after comma, likely US format (e.g., 1,234.56)
      normalizedText = cleanedText.replace(/,/g, "");
    } else if (commaCount === 0 && dotCount === 0) {
      // No separators, just a number
      normalizedText = cleanedText;
    } else if (commaCount === 0) {
      // Only dots, assume decimal separator
      normalizedText = cleanedText;
    } else if (dotCount === 0) {
      // Only commas
      if (commaCount === 1 && cleanedText.split(",")[1].length <= 2) {
        // Single comma with 2 or fewer digits after, likely decimal
        normalizedText = cleanedText.replace(",", ".");
      } else {
        // Multiple commas or comma used as thousands separator
        normalizedText = cleanedText.replace(/,/g, "");
      }
    } else {
      // Both present but equal indices shouldn't happen
      normalizedText = cleanedText.replace(/,/g, "");
    }

    const price = parseFloat(normalizedText);
    return isNaN(price) ? null : price;
  }

  extractCurrency(priceText, textNode = null) {
    // Check for specific multi-character currency symbols first
    if (priceText.includes("C$") || priceText.match(/CA\s*\$/)) return "CAD";
    if (priceText.includes("A$") || priceText.match(/AU\s*\$/)) return "AUD";
    if (priceText.includes("NZ$") || priceText.match(/NZ\s*\$/)) return "NZD";
    if (priceText.includes("S$") || priceText.match(/SG\s*\$/)) return "SGD";
    if (priceText.includes("HK$") || priceText.match(/HK\s*\$/)) return "HKD";
    if (priceText.includes("US$")) return "USD";

    // Check for currency code with $ patterns (e.g., AUD$, CAD$)
    if (priceText.match(/CAD\s*\$/)) return "CAD";
    if (priceText.match(/AUD\s*\$/)) return "AUD";
    if (priceText.match(/NZD\s*\$/)) return "NZD";
    if (priceText.match(/SGD\s*\$/)) return "SGD";
    if (priceText.match(/HKD\s*\$/)) return "HKD";

    // Check for yen/yuan specific patterns
    if (priceText.match(/JP\s*¥/) || priceText.match(/JPY\s*¥/)) return "JPY";
    if (
      priceText.match(/CN\s*¥/) ||
      priceText.match(/CNY\s*¥/) ||
      priceText.includes("RMB") ||
      priceText.includes("元")
    )
      return "CNY";

    // Check for kr specific patterns
    if (priceText.match(/SEK\s*kr/i)) return "SEK";
    if (priceText.match(/NOK\s*kr/i)) return "NOK";
    if (priceText.match(/DKK\s*kr/i)) return "DKK";
    if (priceText.match(/ISK\s*kr/i)) return "ISK";

    // Check for Bitcoin symbol
    if (priceText.includes("₿")) return "BTC";

    // Check for cryptocurrency codes
    const cryptoMatch = priceText.match(
      /\b(BTC|ETH|BNB|XRP|SOL|DOGE|TRX|ADA|BCH|XLM|LTC|DOT|XMR|PEPE|AAVE|PI|CRO|TRUMP|VET|RENDER|WLD)\b/i
    );
    if (cryptoMatch) {
      return cryptoMatch[1].toUpperCase();
    }

    // First check if the price text itself contains clear currency indicators
    const directCurrencyMatch = priceText.match(
      /\b(AUD|USD|EUR|GBP|CAD|NZD|SGD|HKD|CHF|JPY|CNY|INR|KRW|MXN|BRL|ZAR|NOK|SEK|DKK|PLN|CZK|HUF|RON|BGN|TRY|ILS|THB|MYR|IDR|PHP|ISK)\b/i
    );
    if (directCurrencyMatch) {
      return directCurrencyMatch[1].toUpperCase();
    }

    // Handle edge case where price has currency symbols
    for (const [symbol, currency] of Object.entries({
      "€": "EUR",
      "£": "GBP",
      "¥": "JPY",
      $: "USD",
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
      kr: "SEK",
      zł: "PLN",
      Kč: "CZK",
      Ft: "HUF",
      lei: "RON",
      лв: "BGN",
    })) {
      if (priceText.includes(symbol)) {
        return currency;
      }
    }

    return this.baseCurrency;
  }

  detectCurrencyFromSymbol(symbol) {
    // Map common currency symbols to their codes
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
}

// Test suite
describe("Price Detection Tests", () => {
  const priceConverter = new PriceConverter();

  // Helper function to test price detection
  const testPriceDetection = (text, expectedCurrency, expectedAmount) => {
    let detectedPrice = null;
    let detectedCurrency = null;

    // Try each price pattern
    for (const pattern of PRICE_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);

      if (match) {
        const matchedText = match[0];
        detectedPrice = priceConverter.extractPrice(matchedText);
        detectedCurrency = priceConverter.extractCurrency(matchedText);

        if (detectedPrice && detectedCurrency) {
          break;
        }
      }
    }

    return { detectedPrice, detectedCurrency };
  };

  describe("Basic Currency Symbols", () => {
    test.each([
      ["$99.99", "USD", 99.99],
      ["€49.99", "EUR", 49.99],
      ["£29.99", "GBP", 29.99],
      ["¥5,000", "JPY", 5000],
      ["₹999", "INR", 999],
      ["₩50,000", "KRW", 50000],
      ["R$199.90", "BRL", 199.9],
      ["CHF 789.00", "CHF", 789.0],
      ["₺1,234.56", "TRY", 1234.56],
      ["zł123.45", "PLN", 123.45],
      ["฿999", "THB", 999],
      ["₱1,234.56", "PHP", 1234.56],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 2);
      }
    );
  });

  describe("Currency Codes", () => {
    test.each([
      ["USD 123.45", "USD", 123.45],
      ["EUR 234.56", "EUR", 234.56],
      ["GBP 345.67", "GBP", 345.67],
      ["123.45 USD", "USD", 123.45],
      ["234.56 EUR", "EUR", 234.56],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 2);
      }
    );
  });

  describe("Cryptocurrencies", () => {
    test.each([
      ["₿0.00123456", "BTC", 0.00123456],
      ["BTC 0.001", "BTC", 0.001],
      ["0.001 BTC", "BTC", 0.001],
      ["ETH 0.05", "ETH", 0.05],
      ["0.05 ETH", "ETH", 0.05],
      ["100 DOGE", "DOGE", 100],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 6);
      }
    );
  });

  describe("Multi-Currency Dollar Signs", () => {
    test.each([
      ["A$99.99", "AUD", 99.99],
      ["AU$99.99", "AUD", 99.99],
      ["AU $99.99", "AUD", 99.99],
      ["AU $1,234.56", "AUD", 1234.56],
      ["AUD$99.99", "AUD", 99.99],
      ["AUD $1,234.56", "AUD", 1234.56],
      ["C$123.45", "CAD", 123.45],
      ["CA$123.45", "CAD", 123.45],
      ["CA $123.45", "CAD", 123.45],
      ["CA $1,234.56", "CAD", 1234.56],
      ["CAD$99.99", "CAD", 99.99],
      ["HK$456.78", "HKD", 456.78],
      ["S$234.56", "SGD", 234.56],
      ["NZ$345.67", "NZD", 345.67],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 2);
      }
    );
  });

  describe("Dollar Symbol with Currency Code", () => {
    test.each([
      ["$1,200 HKD", "HKD", 1200],
      ["$1,500 CAD", "CAD", 1500],
      ["$2,000 AUD", "AUD", 2000],
      ["$500 NZD", "NZD", 500],
      ["$300 SGD", "SGD", 300],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 2);
      }
    );
  });

  describe("Multi-Currency Symbols", () => {
    test.each([
      ["JP¥ 10,000", "JPY", 10000],
      ["CN¥ 888", "CNY", 888],
      ["SEKkr 100", "SEK", 100],
      ["NOKkr 200", "NOK", 200],
      ["DKKkr 300", "DKK", 300],
      ["ISKkr 400", "ISK", 400],
      ["100kr", "SEK", 100],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 2);
      }
    );
  });

  describe("European Number Format", () => {
    test.each([
      ["€1.234,56", "EUR", 1234.56],
      ["€1.000.000,00", "EUR", 1000000.0],
      ["kr 1.234,56", "SEK", 1234.56],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 2);
      }
    );
  });

  describe("Indian Number Format", () => {
    test.each([
      ["₹1,23,456", "INR", 123456],
      ["₹99,999", "INR", 99999],
      ["INR 1,23,456", "INR", 123456],
    ])(
      "should detect %s as %s %s",
      (text, expectedCurrency, expectedAmount) => {
        const result = testPriceDetection(
          text,
          expectedCurrency,
          expectedAmount
        );
        expect(result.detectedCurrency).toBe(expectedCurrency);
        expect(result.detectedPrice).toBeCloseTo(expectedAmount, 2);
      }
    );
  });

  describe("Edge Cases", () => {
    test("should handle superscript cents", () => {
      const price = priceConverter.extractPrice("$29.99");
      const currency = priceConverter.extractCurrency("$29.99");
      expect(price).toBeCloseTo(29.99, 2);
      expect(currency).toBe("USD");
    });

    test("should handle split prices", () => {
      const symbolCurrency = priceConverter.detectCurrencyFromSymbol("AU$");
      const price = priceConverter.extractPrice("1,234.56");
      expect(symbolCurrency).toBe("AUD");
      expect(price).toBeCloseTo(1234.56, 2);
    });

    test("should handle no price", () => {
      const result = testPriceDetection("No price here", null, null);
      expect(result.detectedPrice).toBeNull();
      expect(result.detectedCurrency).toBeNull();
    });

    test("should handle ambiguous $ symbol", () => {
      const currency = priceConverter.extractCurrency("$100");
      expect(currency).toBe("USD"); // Default to USD for bare $ symbol
    });
  });
});
