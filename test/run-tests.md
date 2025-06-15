# Running Tests

## To run all tests:

```bash
npm test
```

## To run tests in watch mode:

```bash
npm run test:watch
```

## To run tests with coverage:

```bash
npm run test:coverage
```

## To run specific tests:

```bash
# Run tests matching a pattern
npm test -- --testNamePattern="USD"

# Run a specific test file
npm test test/price-detection.test.js
```

## Test Structure

- `test/price-detection.test.js` - Main test file that tests price detection patterns
- Uses Jest framework
- Tests the core pattern matching, price extraction, and currency detection logic

## Recent Fixes Applied:

1. **Overlapping Pattern Handling**: Updated `PatternMatcher.js` to prioritize matches containing currency codes over generic patterns. For example, "$50.00 AUD" is now correctly detected as AUD instead of USD.

2. **Rs. Currency Detection**: Added pattern in `CurrencyDetector.js` to properly detect "Rs." as INR (Indian Rupees).

3. **Superscript Price Handling**: Already supported in `PriceExtractor.js` for Unicode superscript characters (e.g., $99⁹⁹).

## Patterns Now Working:

- ✅ CA$123.45 → CAD
- ✅ CA $123.45 → CAD
- ✅ Rs. 1,234.56 → INR
- ✅ A$19⁹⁹⁹ → AUD
- ✅ $50.00 AUD → AUD
- ✅ You save: $50.00 AUD → AUD
- ✅ ¥2000 → JPY
- ✅ " $ 99.99" → USD
