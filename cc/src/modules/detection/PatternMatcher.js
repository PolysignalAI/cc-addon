import { PRICE_PATTERNS, CURRENCY_SYMBOLS } from "../../constants.js";

/**
 * Manages price pattern matching and optimization
 * Provides a clean interface for finding prices in text
 */
export class PatternMatcher {
  constructor() {
    this.patterns = PRICE_PATTERNS;
    this.matchCache = new Map();
    this.cacheSize = 0;
    this.maxCacheSize = 1000;
  }

  /**
   * Find all price matches in text
   */
  findPriceMatches(text) {
    if (!text || typeof text !== "string") return [];

    // Check cache
    if (this.matchCache.has(text)) {
      return this.matchCache.get(text);
    }

    const matches = [];

    // Try each pattern
    for (const pattern of this.patterns) {
      // Reset pattern state
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text))) {
        matches.push({
          text: match[0],
          index: match.index,
          pattern: pattern.source,
        });

        // Prevent infinite loop on zero-width matches
        if (match.index === pattern.lastIndex) {
          pattern.lastIndex++;
        }
      }
    }

    // Remove overlapping matches - keep the most specific ones
    const uniqueMatches = this.removeOverlappingMatches(matches);

    // Cache result
    this.cacheMatch(text, uniqueMatches);

    return uniqueMatches;
  }

  /**
   * Find first price match in text
   */
  findFirstMatch(text) {
    const matches = this.findPriceMatches(text);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Check if text contains any price pattern
   */
  containsPrice(text) {
    if (!text) return false;

    for (const pattern of this.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Remove overlapping matches - keep the most specific ones
   * For example, if we have "CA$123" and "A$123" and "$123", keep only "CA$123"
   */
  removeOverlappingMatches(matches) {
    if (matches.length <= 1) return matches;

    // First, group overlapping matches
    const groups = [];
    const used = new Set();

    for (let i = 0; i < matches.length; i++) {
      if (used.has(i)) continue;

      const group = [matches[i]];
      used.add(i);

      const start1 = matches[i].index;
      const end1 = matches[i].index + matches[i].text.length;

      for (let j = i + 1; j < matches.length; j++) {
        if (used.has(j)) continue;

        const start2 = matches[j].index;
        const end2 = matches[j].index + matches[j].text.length;

        // Check if they overlap
        if (
          (start2 >= start1 && start2 < end1) ||
          (end2 > start1 && end2 <= end1) ||
          (start1 >= start2 && start1 < end2) ||
          (end1 > start2 && end1 <= end2)
        ) {
          group.push(matches[j]);
          used.add(j);
        }
      }

      groups.push(group);
    }

    // For each group, keep the most specific match
    const kept = [];
    for (const group of groups) {
      if (group.length === 1) {
        kept.push(group[0]);
      } else {
        // Sort by specificity: prefer matches with currency symbols, then with currency codes, then by length
        group.sort((a, b) => {
          // Check if either has a currency symbol
          const currencySymbolPattern = /[$€£¥₹₩₺฿₱₨₽₴₪₦₵₫₡₸₮]/;
          const aHasSymbol = currencySymbolPattern.test(a.text);
          const bHasSymbol = currencySymbolPattern.test(b.text);

          if (aHasSymbol && !bHasSymbol) return -1;
          if (!aHasSymbol && bHasSymbol) return 1;

          // Check if either has a currency code pattern
          const aHasCurrencyCode =
            /\b(USD|CAD|AUD|NZD|SGD|HKD|EUR|GBP|JPY|INR|CNY|KRW)\b/i.test(
              a.text
            );
          const bHasCurrencyCode =
            /\b(USD|CAD|AUD|NZD|SGD|HKD|EUR|GBP|JPY|INR|CNY|KRW)\b/i.test(
              b.text
            );

          if (aHasCurrencyCode && !bHasCurrencyCode) return -1;
          if (!aHasCurrencyCode && bHasCurrencyCode) return 1;

          // Then by length (longer is more specific)
          return b.text.length - a.text.length;
        });
        kept.push(group[0]);
      }
    }

    // Sort by index for processing order
    return kept.sort((a, b) => a.index - b.index);
  }

  /**
   * Remove duplicate matches (same text at same position) - DEPRECATED
   */
  deduplicateMatches(matches) {
    const seen = new Set();
    const unique = [];

    for (const match of matches) {
      const key = `${match.index}:${match.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(match);
      }
    }

    // Sort by index
    return unique.sort((a, b) => a.index - b.index);
  }

  /**
   * Get pattern for specific currency
   */
  getPatternsForCurrency(currency) {
    const currencyPatterns = [];

    // Filter patterns that specifically match this currency
    for (const pattern of this.patterns) {
      const source = pattern.source;
      if (
        source.includes(currency) ||
        source.includes(this.getCurrencySymbol(currency))
      ) {
        currencyPatterns.push(pattern);
      }
    }

    return currencyPatterns;
  }

  /**
   * Get currency symbol (basic mapping)
   */
  getCurrencySymbol(currency) {
    return CURRENCY_SYMBOLS[currency] || currency;
  }

  /**
   * Cache match results
   */
  cacheMatch(text, matches) {
    // Implement LRU cache
    if (this.cacheSize >= this.maxCacheSize) {
      // Remove oldest entries (simple FIFO for now)
      const firstKey = this.matchCache.keys().next().value;
      this.matchCache.delete(firstKey);
      this.cacheSize--;
    }

    this.matchCache.set(text, matches);
    this.cacheSize++;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.matchCache.clear();
    this.cacheSize = 0;
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern) {
    if (pattern instanceof RegExp) {
      this.patterns.push(pattern);
    }
  }

  /**
   * Remove pattern
   */
  removePattern(pattern) {
    const index = this.patterns.indexOf(pattern);
    if (index > -1) {
      this.patterns.splice(index, 1);
    }
  }

  /**
   * Get pattern statistics (for debugging/optimization)
   */
  getPatternStats() {
    return {
      totalPatterns: this.patterns.length,
      cacheSize: this.cacheSize,
      maxCacheSize: this.maxCacheSize,
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  /**
   * Calculate cache hit rate
   */
  calculateCacheHitRate() {
    // This would need to track hits/misses in production
    return 0; // Placeholder
  }
}
