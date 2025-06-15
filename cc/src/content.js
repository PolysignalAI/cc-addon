import {
  ALL_SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CRYPTO_SYMBOL_TO_NAME,
  DEFAULT_SETTINGS,
  FIAT_CURRENCY_NAMES,
  PRICE_PATTERNS,
  SUPPORTED_CRYPTO_CURRENCIES,
} from "./constants.js";

// Don't run on extension pages
if (
  window.location.protocol === "chrome-extension:" ||
  window.location.protocol === "moz-extension:" ||
  window.location.href.includes("extension://")
) {
  console.log("Content script disabled on extension page");
} else {
  class PriceConverter {
    constructor() {
      this.baseCurrency = DEFAULT_SETTINGS.baseCurrency;
      this.selectedCurrencies = DEFAULT_SETTINGS.selectedCurrencies;
      this.exchangeRates = {};
      this.processedNodes = new WeakSet();
      this.isProcessing = false;
      this.initTimeout = null;
      this.isDisabled = false; // Track if extension is disabled for this page
      this.extensionEnabled = true; // Track if extension is globally enabled

      // Performance optimization
      this.processingQueue = [];
      this.isProcessingQueue = false;
      this.mutationDebounceTimer = null;
      this.lastMutationCount = 0;
      this.mutationFrequency = 0;

      // Appearance settings
      this.appearance = DEFAULT_SETTINGS.appearance;

      // Disabled URLs
      this.disabledUrls = [];

      // BTC denomination preference
      this.btcDenomination = "btc";

      // Smart currency detection
      this.pageCurrency = null; // Global currency detected for this page
      this.currencyCache = new Map(); // Cache of currency detection results to avoid re-processing

      // Visibility tracking
      this.hasProcessed = false;
      this.lastVisibilityCheck = Date.now();
      this.REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

      console.log("PriceConverter initialized");
      this.init();
      this.setupPeriodicCleanup();
    }

    async init() {
      console.log("Starting initialization...");
      console.log("Current URL:", window.location.href);

      // Debug CSS loading order
      console.log("Checking existing stylesheets before init:");
      Array.from(document.styleSheets).forEach((sheet, index) => {
        try {
          console.log(`  Sheet ${index}:`, sheet.href || "inline style");
        } catch (e) {
          console.log(`  Sheet ${index}: (cross-origin or inaccessible)`);
        }
      });

      await this.loadSettings();

      // Inject dynamic styles after loading settings
      this.injectDynamicStyles();

      // Check if extension is globally disabled
      if (!this.extensionEnabled) {
        this.isDisabled = true;
        console.log("Extension globally disabled, stopping initialization");
        return;
      }

      // Check if extension is disabled for this URL
      console.log("Checking if URL is disabled...");
      console.log("Disabled URLs list:", this.disabledUrls);
      if (this.isUrlDisabled()) {
        this.isDisabled = true;
        console.log("Extension disabled for this URL, stopping initialization");
        return;
      }
      console.log("URL is not disabled, continuing...");

      await this.fetchExchangeRates();

      // Wait for page to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          this.startProcessing();
        });
      } else {
        this.startProcessing();
      }

      this.setupMessageListener();
    }

    startProcessing() {
      // Set up visibility change handler
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          this.onTabBecameVisible();
        }
      });

      // Process immediately if tab is visible
      if (!document.hidden) {
        this.performInitialScan();
      } else {
        console.log("Tab is hidden, waiting for visibility...");
      }
    }

    onTabBecameVisible() {
      const now = Date.now();
      const timeSinceLastCheck = now - this.lastVisibilityCheck;

      console.log(
        `Tab became visible. Time since last check: ${Math.floor(
          timeSinceLastCheck / 1000
        )}s`
      );

      // Only refresh if it's been more than the threshold since last check
      if (timeSinceLastCheck < this.REFRESH_THRESHOLD) {
        console.log("Recently checked, skipping refresh");
        return;
      }

      this.lastVisibilityCheck = now;

      // Always fetch fresh exchange rates when tab becomes visible after threshold
      this.fetchExchangeRates()
        .then(() => {
          // If rates have been updated, refresh all tooltips
          if (!this.hasProcessed) {
            this.hasProcessed = true;
            this.performInitialScan();
          } else {
            // Tab was already processed, just update existing tooltips with new rates
            console.log("Refreshing tooltips with latest exchange rates...");
            this.removeAllTooltips();
            this.scanAndConvert();
          }
        })
        .catch((error) => {
          console.error("Failed to update rates on tab visibility:", error);
        });
    }

    performInitialScan() {
      // Delay initial scan to let page fully render
      setTimeout(() => {
        console.log("Starting price scanning...");
        this.detectPageCurrency();
        this.scanAndConvert();
        this.setupObserver();
      }, 1000);
    }

    // Smart Currency Detection Methods
    detectPageCurrency() {
      console.log("Detecting page-wide currency...");

      // Fast, limited selectors only - avoid expensive attribute searches
      const indicators = [
        // Meta tags (very fast)
        'meta[name="currency"]',
        'meta[property="currency"]',
        // Simple class/id names (fast)
        ".currency-selector",
        "#currency-selector",
        ".currency-code",
        "[data-currency]",
      ];

      for (const selector of indicators) {
        try {
          const elements = document.querySelectorAll(selector);
          // Limit to first 3 elements to prevent excessive processing
          for (let i = 0; i < Math.min(3, elements.length); i++) {
            const currency = this.extractCurrencyFromElement(elements[i]);
            if (currency) {
              this.pageCurrency = currency;
              console.log(`Found page currency: ${currency} from ${selector}`);
              return currency;
            }
          }
        } catch (e) {
          // Continue if selector fails
        }
      }

      // Quick text pattern search - limit to first 1000 chars of body text
      const textContent = (document.body.textContent || "").substring(0, 1000);
      const currencyPatterns = [
        /prices?\s+(?:in\s+)?([A-Z]{3})/i,
        /currency:\s*([A-Z]{3})/i,
        /all\s+prices?\s+([A-Z]{3})/i,
      ];

      for (const pattern of currencyPatterns) {
        const match = textContent.match(pattern);
        if (match && this.isValidCurrency(match[1])) {
          this.pageCurrency = match[1];
          console.log(`Found page currency from text: ${match[1]}`);
          return match[1];
        }
      }

      console.log("No page-wide currency detected, using user default");
      return null;
    }

    extractCurrencyFromElement(element) {
      // Check data attributes first
      const dataCurrency = element.getAttribute("data-currency");
      if (dataCurrency && this.isValidCurrency(dataCurrency)) {
        return dataCurrency.toUpperCase();
      }

      // Check text content
      const text = element.textContent || "";
      const currencyMatch = text.match(/\b([A-Z]{3})\b/);
      if (currencyMatch && this.isValidCurrency(currencyMatch[1])) {
        return currencyMatch[1];
      }

      // Check value attribute
      const value = element.getAttribute("value");
      if (value && this.isValidCurrency(value)) {
        return value.toUpperCase();
      }

      return null;
    }

    isValidCurrency(code) {
      if (!code || code.length !== 3) return false;
      return ALL_SUPPORTED_CURRENCIES.includes(code.toUpperCase());
    }

    detectNearbyCurrency(textNode, priceText) {
      const parent = textNode.parentElement;
      if (!parent) return null;

      // Create cache key based on parent element to avoid re-processing
      const cacheKey =
        parent.tagName +
        ":" +
        (parent.className || "") +
        ":" +
        priceText.substring(0, 20);
      if (this.currencyCache.has(cacheKey)) {
        return this.currencyCache.get(cacheKey);
      }

      // Limit cache size to prevent memory issues
      if (this.currencyCache.size > 50) {
        this.currencyCache.clear();
      }

      // Quick check for common data attributes first
      const quickDataCheck =
        parent.getAttribute("data-currency") ||
        parent.getAttribute("data-price-currency");
      if (quickDataCheck && this.isValidCurrency(quickDataCheck)) {
        const result = quickDataCheck.toUpperCase();
        this.currencyCache.set(cacheKey, result);
        return result;
      }

      // Check for Schema.org microdata (itemprop="priceCurrency")
      const checkForMicrodata = (element) => {
        if (!element) return null;

        // Check for itemprop="priceCurrency" with content attribute
        const priceCurrencyEl = element.querySelector(
          '[itemprop="priceCurrency"]'
        );
        if (priceCurrencyEl) {
          const content = priceCurrencyEl.getAttribute("content");
          if (content && this.isValidCurrency(content)) {
            return content.toUpperCase();
          }
        }

        // Check if element itself has priceCurrency
        if (element.getAttribute("itemprop") === "priceCurrency") {
          const content = element.getAttribute("content");
          if (content && this.isValidCurrency(content)) {
            return content.toUpperCase();
          }
        }

        return null;
      };

      // Check parent and grandparent for microdata
      let microdataCurrency = checkForMicrodata(parent);
      if (microdataCurrency) {
        this.currencyCache.set(cacheKey, microdataCurrency);
        return microdataCurrency;
      }

      if (parent.parentElement) {
        microdataCurrency = checkForMicrodata(parent.parentElement);
        if (microdataCurrency) {
          this.currencyCache.set(cacheKey, microdataCurrency);
          return microdataCurrency;
        }
      }

      // Check for currency in sibling elements (for cases where $ and amount are in separate spans)
      // Look for currency symbols in previous siblings
      if (parent.previousElementSibling) {
        const prevText = parent.previousElementSibling.textContent || "";
        // Check if previous sibling contains just a currency symbol
        if (prevText.trim().match(/^[\$€£¥]$/)) {
          // Check if there's a priceCurrency attribute nearby
          const currencyEl =
            parent.previousElementSibling.querySelector(
              '[itemprop="priceCurrency"]'
            ) ||
            (parent.previousElementSibling.getAttribute("itemprop") ===
            "priceCurrency"
              ? parent.previousElementSibling
              : null);
          if (currencyEl) {
            const content = currencyEl.getAttribute("content");
            if (content && this.isValidCurrency(content)) {
              this.currencyCache.set(cacheKey, content.toUpperCase());
              return content.toUpperCase();
            }
          }
        }
      }

      // Lightweight contextual search with strict limits - only immediate vicinity
      let searchText = "";

      // Only check parent element text (first 150 chars)
      const parentText = (parent.textContent || "").substring(0, 150);
      searchText += parentText + " ";

      // Check immediate siblings only (first 50 chars each)
      const prevSibling = parent.previousElementSibling;
      if (prevSibling) {
        searchText += (prevSibling.textContent || "").substring(0, 50) + " ";
      }

      const nextSibling = parent.nextElementSibling;
      if (nextSibling) {
        searchText += (nextSibling.textContent || "").substring(0, 50) + " ";
      }

      // Simplified but effective currency detection patterns
      const currencyPatterns = [
        // Direct currency codes with price patterns - highest priority
        /\b(AUD|USD|EUR|GBP|CAD|NZD|SGD|HKD)\s*[\$€£¥]\s*[\d,]+/i,
        /[\$€£¥]\s*[\d,]+[.\d]*\s*(AUD|USD|EUR|GBP|CAD|NZD|SGD|HKD)/i,

        // Number + currency
        /[\d,]+[.\d]*\s+(AUD|USD|EUR|GBP|CAD|NZD|SGD|HKD)/i,

        // Country abbreviations with symbols
        /\b(AU|US|CA|NZ|SG|HK)\s*\$[\d,]/i,
      ];

      let result = null;
      for (const pattern of currencyPatterns) {
        const match = searchText.match(pattern);
        if (match) {
          let currency = match[1].toUpperCase();

          // Handle abbreviations
          const currencyMap = {
            AU: "AUD",
            US: "USD",
            CA: "CAD",
            NZ: "NZD",
            SG: "SGD",
            HK: "HKD",
          };

          currency = currencyMap[currency] || currency;

          if (this.isValidCurrency(currency)) {
            result = currency;
            break;
          }
        }
      }

      // Cache the result (even if null) to avoid re-processing
      this.currencyCache.set(cacheKey, result);
      return result;
    }

    loadSettings() {
      return new Promise((resolve) => {
        chrome.storage.sync.get(
          [
            "selectedCurrencies",
            "baseCurrency",
            "appearance",
            "disabledUrls",
            "extensionEnabled",
            "btcDenomination",
          ],
          (result) => {
            this.selectedCurrencies = result.selectedCurrencies || [
              "EUR",
              "GBP",
              "JPY",
            ];
            this.baseCurrency = result.baseCurrency || "USD";
            this.disabledUrls = result.disabledUrls || [];
            this.extensionEnabled =
              result.extensionEnabled !== undefined
                ? result.extensionEnabled
                : true;
            this.btcDenomination = result.btcDenomination || "btc";

            if (result.appearance) {
              this.appearance = { ...this.appearance, ...result.appearance };
            }

            console.log("Settings loaded:", {
              baseCurrency: this.baseCurrency,
              selectedCurrencies: this.selectedCurrencies,
              disabledUrls: this.disabledUrls,
              extensionEnabled: this.extensionEnabled,
              appearance: this.appearance,
              btcDenomination: this.btcDenomination,
            });

            this.updateDynamicStyles();
            resolve();
          }
        );
      });
    }

    isUrlDisabled() {
      if (!this.disabledUrls || this.disabledUrls.length === 0) {
        return false;
      }

      const currentUrl = window.location.href;

      for (const pattern of this.disabledUrls) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(currentUrl)) {
            console.log(
              `URL ${currentUrl} matches disabled pattern: ${pattern}`
            );
            return true;
          }
        } catch (error) {
          console.warn(`Invalid regex pattern: ${pattern}`, error);
          // Continue checking other patterns even if one is invalid
        }
      }

      return false;
    }

    async fetchExchangeRates() {
      try {
        console.log("Fetching exchange rates from background service...");

        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "getRates" }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        if (response) {
          // Check if we're in error state
          if (response.errorState) {
            console.warn(
              "Background service is in error state - using cached rates if available"
            );
            this.showErrorWarning();
          }

          // Combine fiat and crypto rates
          this.exchangeRates = {
            ...response.fiat,
            ...response.crypto,
          };

          console.log("Exchange rates loaded:", {
            fiatRates: Object.keys(response.fiat || {}).length,
            cryptoRates: Object.keys(response.crypto || {}).length,
            lastUpdate: new Date(response.lastUpdate),
            errorState: response.errorState,
          });

          // Hide error warning if rates are available
          if (Object.keys(this.exchangeRates).length > 0) {
            this.hideErrorWarning();
          }
        } else {
          throw new Error("No response from background service");
        }
      } catch (error) {
        console.error("Failed to fetch exchange rates:", error);
        this.showErrorWarning();
        throw error;
      }
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateSettings") {
          console.log("Received settings update:", request);
          this.selectedCurrencies = request.selectedCurrencies;
          this.baseCurrency = request.baseCurrency;

          // Update btc denomination
          if (request.btcDenomination !== undefined) {
            this.btcDenomination = request.btcDenomination;
          }

          // Update extension enabled state
          if (request.extensionEnabled !== undefined) {
            const wasEnabled = this.extensionEnabled;
            this.extensionEnabled = request.extensionEnabled;

            // If extension was globally disabled
            if (!this.extensionEnabled && wasEnabled) {
              this.isDisabled = true;
              this.removeAllTooltips();
              console.log("Extension globally disabled");
              return;
            } else if (this.extensionEnabled && !wasEnabled) {
              // Extension was re-enabled globally
              this.isDisabled = false;
              console.log("Extension globally re-enabled");
              // Continue to check other conditions and refresh below
            }
          }

          // Update disabled URLs
          if (request.disabledUrls !== undefined) {
            this.disabledUrls = request.disabledUrls;

            // Check if the extension should now be disabled/enabled for this URL
            const shouldBeDisabled = this.isUrlDisabled();
            if (shouldBeDisabled && !this.isDisabled) {
              // Extension should now be disabled
              this.isDisabled = true;
              this.removeAllTooltips();
              console.log("Extension disabled for this URL");
              return;
            } else if (!shouldBeDisabled && this.isDisabled) {
              // Extension should now be enabled
              this.isDisabled = false;
              console.log("Extension re-enabled for this URL");
              // Continue to refresh below
            }
          }

          // Don't process if disabled (either globally or for this URL)
          if (this.isDisabled || !this.extensionEnabled) {
            return;
          }

          if (request.appearance) {
            this.appearance = { ...this.appearance, ...request.appearance };
            this.updateDynamicStyles();
          }

          this.fetchExchangeRates().then(() => {
            this.removeAllTooltips();
            this.scanAndConvert();
          });
        } else if (request.action === "updateAppearance") {
          // Don't process if disabled (either globally or for this URL)
          if (this.isDisabled || !this.extensionEnabled) {
            return;
          }

          console.log("Received appearance update:", request.appearance);
          this.appearance = { ...this.appearance, ...request.appearance };
          this.updateDynamicStyles();
          this.updateExistingPriceElements();
        }
      });
    }

    setupObserver() {
      const observer = new MutationObserver((mutations) => {
        if (this.isProcessing || this.isDisabled || !this.extensionEnabled)
          return;

        // Don't process mutations if tab is hidden
        if (document.hidden) return;

        // Calculate mutation frequency for adaptive debouncing
        this.lastMutationCount = mutations.length;
        this.updateMutationFrequency();

        let shouldProcess = false;
        mutations.forEach((mutation) => {
          // Skip mutations on our own elements
          if (
            mutation.target.classList?.contains("price-wrapper") ||
            mutation.target.classList?.contains("cc-style-underline") ||
            mutation.target.classList?.contains("cc-style-border") ||
            mutation.target.classList?.contains("cc-style-background") ||
            mutation.target.classList?.contains("currency-tooltip")
          ) {
            return;
          }

          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            // Check if any text nodes were added that aren't already wrapped
            mutation.addedNodes.forEach((node) => {
              // Skip our own elements
              if (
                node.classList?.contains("price-wrapper") ||
                node.classList?.contains("cc-style-underline") ||
                node.classList?.contains("cc-style-border") ||
                node.classList?.contains("cc-style-background") ||
                node.classList?.contains("currency-tooltip")
              ) {
                return;
              }

              if (
                node.nodeType === Node.TEXT_NODE ||
                (node.nodeType === Node.ELEMENT_NODE && node.textContent)
              ) {
                shouldProcess = true;
              }
            });
          } else if (mutation.type === "characterData") {
            // Only process character data changes if not inside our elements
            let parent = mutation.target.parentElement;
            let isOurElement = false;
            while (parent) {
              if (
                parent.classList?.contains("price-wrapper") ||
                parent.classList?.contains("cc-style-underline") ||
                parent.classList?.contains("cc-style-border") ||
                parent.classList?.contains("cc-style-background") ||
                parent.classList?.contains("currency-tooltip")
              ) {
                isOurElement = true;
                break;
              }
              parent = parent.parentElement;
            }
            if (!isOurElement) {
              shouldProcess = true;
            }
          }
        });

        if (shouldProcess) {
          this.debouncedProcess();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    // Update mutation frequency for adaptive debouncing
    updateMutationFrequency() {
      const now = Date.now();
      if (this.lastMutationTime) {
        const timeDiff = now - this.lastMutationTime;
        this.mutationFrequency = this.lastMutationCount / (timeDiff / 1000); // mutations per second
      }
      this.lastMutationTime = now;
    }

    // Adaptive debouncing based on mutation frequency
    debouncedProcess() {
      clearTimeout(this.mutationDebounceTimer);

      let delay = 250; // Default delay (reduced from 500ms)
      if (this.mutationFrequency > 10) {
        delay = 1000; // High frequency: longer delay (reduced from 2000ms)
      } else if (this.mutationFrequency > 2) {
        delay = 250; // Medium frequency: default delay (reduced from 500ms)
      } else {
        delay = 50; // Low frequency: shorter delay (reduced from 100ms)
      }

      this.mutationDebounceTimer = setTimeout(() => {
        this.scanAndConvert();
      }, delay);
    }

    async scanAndConvert() {
      if (this.isProcessing || this.isDisabled || !this.extensionEnabled)
        return;
      this.isProcessing = true;

      console.log("Scanning for prices with async processing...");

      // Clean up any orphaned tooltips before processing new content
      this.cleanupOrphanedTooltips();

      let processedCount = 0;

      // First, scan for price elements with microdata structure
      processedCount += this.scanPriceElements();

      // Scan for split prices (like Amazon's structure)
      processedCount += this.scanSplitPrices();

      // Scan for prices with superscript (like $99<sup>99</sup>)
      processedCount += this.scanSuperscriptPrices();

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            // Skip if already processed
            if (this.processedNodes.has(node)) {
              return NodeFilter.FILTER_REJECT;
            }

            // Check all ancestors to ensure we're not inside a price-wrapper or tooltip
            let parent = node.parentElement;
            while (parent) {
              // Check if parent is in processedNodes (for structured prices)
              if (this.processedNodes.has(parent)) {
                return NodeFilter.FILTER_REJECT;
              }

              if (
                parent.classList.contains("currency-tooltip") ||
                parent.classList.contains("price-wrapper") ||
                parent.classList.contains("cc-style-underline") ||
                parent.classList.contains("cc-style-border") ||
                parent.classList.contains("cc-style-background")
              ) {
                return NodeFilter.FILTER_REJECT;
              }
              parent = parent.parentElement;
            }

            // Check if node contains price patterns
            const text = node.textContent;
            return PRICE_PATTERNS.some((pattern) => {
              pattern.lastIndex = 0; // Reset regex
              return pattern.test(text);
            })
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        }
      );

      const nodesToProcess = [];
      let node;
      while ((node = walker.nextNode())) {
        nodesToProcess.push(node);
      }

      console.log(
        `Found ${nodesToProcess.length} text nodes with potential prices`
      );

      // Process nodes in chunks to prevent page freezing
      processedCount += await this.processNodesInChunks(nodesToProcess);

      console.log(`Processed ${processedCount} price elements`);
      this.isProcessing = false;
    }

    // Scan for price elements with Schema.org microdata
    scanPriceElements() {
      let processedCount = 0;

      // Find elements with itemprop="price"
      const priceElements = document.querySelectorAll('[itemprop="price"]');

      priceElements.forEach((priceEl) => {
        // Skip if already processed
        if (
          this.processedNodes.has(priceEl) ||
          priceEl.closest(".price-wrapper")
        ) {
          return;
        }

        // Get the price value
        const priceValue =
          priceEl.getAttribute("content") || priceEl.textContent;
        const price = this.extractPrice(priceValue);

        if (!price || price <= 0) return;

        // Look for currency information
        let currency = null;
        const parent = priceEl.parentElement;

        if (parent) {
          // Check for priceCurrency sibling
          const currencyEl = parent.querySelector('[itemprop="priceCurrency"]');
          if (currencyEl) {
            currency = currencyEl.getAttribute("content");
          }
        }

        // If we found a valid currency, process this price
        if (currency && this.isValidCurrency(currency)) {
          // Mark the entire parent structure as processed to prevent duplicate detection
          if (parent) {
            this.processedNodes.add(parent);
            // Mark all child elements as processed
            parent.querySelectorAll("*").forEach((child) => {
              this.processedNodes.add(child);
            });
          }

          // Also mark the currency element specifically
          const currencyEl = parent
            ? parent.querySelector('[itemprop="priceCurrency"]')
            : null;
          if (currencyEl) {
            this.processedNodes.add(currencyEl);
          }

          const textNode = priceEl.firstChild;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            // Create a combined text representation
            const displayText =
              currencyEl && currencyEl.textContent
                ? `${currencyEl.textContent}${textNode.textContent}`
                : textNode.textContent;

            // Process as if it were a regular text node
            const matches = [
              {
                start: 0,
                end: textNode.textContent.length,
                text: displayText,
                price: price,
                currency: currency.toUpperCase(),
              },
            ];

            // Create wrapper
            const wrapper = document.createElement("span");
            wrapper.className = "price-wrapper";

            // Create price element with tooltip
            const priceElement = this.createPriceElement(
              displayText,
              price,
              currency.toUpperCase()
            );
            wrapper.appendChild(priceElement);

            // Replace the entire parent structure with our wrapper
            if (parent && parent.parentNode) {
              parent.parentNode.replaceChild(wrapper, parent);
            } else {
              textNode.parentNode.replaceChild(wrapper, textNode);
            }

            this.processedNodes.add(wrapper);
            this.processedNodes.add(priceEl);

            processedCount++;
          }
        }
      });

      return processedCount;
    }

    scanSplitPrices() {
      let processedCount = 0;

      // Find all elements that might contain currency symbols
      const allElements = document.querySelectorAll("span, div, p");
      console.log(
        `scanSplitPrices: Found ${allElements.length} elements to check`
      );

      allElements.forEach((element) => {
        // Skip if already processed or inside our wrapper
        if (
          this.processedNodes.has(element) ||
          element.closest(".price-wrapper")
        ) {
          return;
        }

        // Skip if this element has too many children (likely not a price container)
        if (element.children.length > 10) {
          return;
        }

        // Look for a currency symbol in the direct children
        let symbolElement = null;
        let symbolText = null;
        let priceElements = [];

        for (let i = 0; i < element.children.length; i++) {
          const child = element.children[i];
          const text = child.textContent.trim();

          // Check if this child contains a currency symbol
          if (!symbolElement && text.match(/^[$€£¥₹₽₺₩₦₵₨₫₱₡₸₮₴₪]+$/)) {
            symbolElement = child;
            symbolText = text;
          } else if (symbolElement && text.match(/^[\d,]+\.?\d*$/)) {
            // This looks like a price number following a symbol
            priceElements.push(child);
          } else if (
            symbolElement &&
            priceElements.length > 0 &&
            !text.match(/^[\d,\.]+$/)
          ) {
            // We hit a non-numeric element after finding price parts, stop collecting
            break;
          }
        }

        // If we found a symbol and at least one number, we likely have a split price
        if (symbolElement && priceElements.length > 0) {
          // Reconstruct the price
          let fullPriceText = "";
          priceElements.forEach((el, index) => {
            if (index === 0) {
              fullPriceText += el.textContent.trim();
            } else {
              // Handle decimal parts
              const prevText = priceElements[index - 1].textContent.trim();
              const currentText = el.textContent.trim();
              if (prevText.endsWith(".") || currentText.match(/^\d{2}$/)) {
                fullPriceText += currentText;
              } else {
                fullPriceText += "." + currentText;
              }
            }
          });

          // Clean up the price text
          fullPriceText = fullPriceText.replace(/,/g, "").replace(/\.+/g, ".");

          // Ensure we actually have numeric content
          if (!fullPriceText || !fullPriceText.match(/\d/)) {
            return; // Skip this element - no numeric content
          }

          const price = parseFloat(fullPriceText);

          console.log(
            `Found split price: ${symbolText}${fullPriceText} = ${price}`
          );

          if (!isNaN(price) && price > 0) {
            // Detect currency
            const currency = this.detectCurrencyFromSymbol(symbolText);

            // Mark all child elements as processed
            [symbolElement, ...priceElements].forEach((el) => {
              this.processedNodes.add(el);
              if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
                this.processedNodes.add(el.firstChild);
              }
            });

            // Create tooltip
            const tooltip = this.createTooltip(price, currency);
            if (tooltip) {
              // Apply appearance settings to the container
              this.applyAppearanceToElement(element);

              // Store tooltip reference
              element._tooltip = tooltip;

              // Add hover listeners
              element.addEventListener("mouseenter", (e) => {
                console.log("Mouse entered split price element");
                e.stopPropagation();

                if (tooltip._hideTimeout) {
                  clearTimeout(tooltip._hideTimeout);
                  delete tooltip._hideTimeout;
                }
                this.showPortalTooltip(element, tooltip);
              });

              element.addEventListener("mouseleave", (e) => {
                console.log("Mouse left split price element");
                e.stopPropagation();
                this.hidePortalTooltip(tooltip);
              });

              // Mark container as processed
              this.processedNodes.add(element);
              processedCount++;
            }
          }
        }
      });

      return processedCount;
    }

    scanSuperscriptPrices() {
      let processedCount = 0;

      // Find all elements that might have superscript prices
      const potentialElements = document.querySelectorAll("*");

      potentialElements.forEach((element) => {
        // Skip if already processed
        if (
          this.processedNodes.has(element) ||
          element.closest(".price-wrapper")
        ) {
          return;
        }

        // Check if element has text content followed by a sup element
        const children = Array.from(element.childNodes);

        for (let i = 0; i < children.length - 1; i++) {
          const currentNode = children[i];
          const nextNode = children[i + 1];

          // Look for pattern: text node with currency + sup element
          if (
            currentNode.nodeType === Node.TEXT_NODE &&
            nextNode.nodeType === Node.ELEMENT_NODE &&
            nextNode.tagName === "SUP"
          ) {
            const mainText = currentNode.textContent;
            const supText = nextNode.textContent;

            // Check if main text has currency symbol and number
            const currencyMatch = mainText.match(
              /([€$£¥₹C\$A\$]|USD|EUR|GBP)\s*(\d+)/
            );
            if (currencyMatch && supText.match(/^\d+$/)) {
              const currency = this.extractCurrency(mainText);
              const fullPrice = parseFloat(currencyMatch[2] + "." + supText);

              if (currency && fullPrice > 0) {
                // Create wrapper for the price
                const wrapper = document.createElement("span");
                wrapper.className = "price-wrapper";

                // Clone the original structure
                const mainPart = document.createTextNode(mainText);
                const supPart = document.createElement("sup");
                supPart.textContent = supText;

                wrapper.appendChild(mainPart);
                wrapper.appendChild(supPart);

                // Create tooltip
                const tooltip = this.createTooltip(fullPrice, currency);
                if (tooltip) {
                  // Apply appearance settings
                  this.applyAppearanceToElement(wrapper);
                  wrapper._tooltip = tooltip;

                  // Add hover listeners
                  wrapper.addEventListener("mouseenter", (e) => {
                    e.stopPropagation();
                    if (tooltip._hideTimeout) {
                      clearTimeout(tooltip._hideTimeout);
                      delete tooltip._hideTimeout;
                    }
                    this.showPortalTooltip(wrapper, tooltip);
                  });

                  wrapper.addEventListener("mouseleave", (e) => {
                    e.stopPropagation();
                    this.hidePortalTooltip(tooltip);
                  });

                  // Replace original nodes with wrapper
                  element.insertBefore(wrapper, currentNode);
                  element.removeChild(currentNode);
                  element.removeChild(nextNode);

                  // Mark as processed
                  this.processedNodes.add(wrapper);
                  this.processedNodes.add(element);
                  processedCount++;
                }
              }
            }
          }
        }
      });

      return processedCount;
    }

    detectCurrencyFromSymbol(symbol) {
      // Map common currency symbols to their codes
      const symbolMap = {
        $: "USD",
        "€": "EUR",
        "£": "GBP",
        "¥": "JPY",
        C$: "CAD",
        A$: "AUD",
        NZ$: "NZD",
        HK$: "HKD",
        S$: "SGD",
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
        Q: "GTQ",
        "₸": "KZT",
        "₮": "MNT",
        lei: "RON",
        ден: "MKD",
        CHF: "CHF",
        NOK: "NOK",
        DKK: "DKK",
        AED: "AED",
        SAR: "SAR",
        QAR: "QAR",
        KWD: "KWD",
        BHD: "BHD",
        OMR: "OMR",
        JOD: "JOD",
        MYR: "MYR",
        THB: "THB",
        IDR: "IDR",
        MXN: "MXN",
        CLP: "CLP",
        ARS: "ARS",
        COP: "COP",
        PEN: "PEN",
        UYU: "UYU",
      };

      // Check for exact match
      if (symbolMap[symbol]) {
        return symbolMap[symbol];
      }

      // Check if it's already a currency code
      if (
        SUPPORTED_FIAT_CURRENCIES.includes(symbol) ||
        SUPPORTED_CRYPTO_CURRENCIES.includes(symbol)
      ) {
        return symbol;
      }

      // Default to page currency or USD
      return this.pageCurrency || "USD";
    }

    scanAmazonPrices() {
      let processedCount = 0;

      // Find Amazon price containers with class "a-price"
      const amazonPrices = document.querySelectorAll(".a-price");

      amazonPrices.forEach((priceContainer) => {
        // Skip if already processed
        if (
          this.processedNodes.has(priceContainer) ||
          priceContainer.closest(".price-wrapper")
        ) {
          return;
        }

        // Look for the price components within the container
        // Amazon often has the actual price in a span with aria-hidden="true"
        const priceSpan =
          priceContainer.querySelector('[aria-hidden="true"]') ||
          priceContainer;

        // Extract price components
        const symbolElement = priceSpan.querySelector(".a-price-symbol");
        const wholeElement = priceSpan.querySelector(".a-price-whole");
        const fractionElement = priceSpan.querySelector(".a-price-fraction");

        if (!symbolElement || !wholeElement) return;

        // Build the complete price
        let priceText = symbolElement.textContent;
        let priceValue = wholeElement.textContent
          .replace(/[,\s]/g, "")
          .replace(/\.$/, ""); // Remove comma, spaces, and trailing dot

        if (fractionElement) {
          priceValue += "." + fractionElement.textContent;
        }

        const price = parseFloat(priceValue);
        if (isNaN(price) || price === 0) return;

        // Detect currency from symbol
        const currency = this.detectCurrencyFromSymbol(
          symbolElement.textContent.trim()
        );
        if (!currency) return;

        // Mark all child nodes as processed
        const allNodes = priceContainer.querySelectorAll("*");
        allNodes.forEach((node) => {
          if (node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) {
            this.processedNodes.add(node.firstChild);
          }
        });

        // Create the tooltip
        const tooltip = this.createTooltip(price, currency);
        if (!tooltip) return;

        // Apply appearance settings to the price container
        this.applyAppearanceToElement(priceContainer);

        // Store tooltip reference
        priceContainer._tooltip = tooltip;

        // Add hover listeners
        priceContainer.addEventListener("mouseenter", (e) => {
          console.log("Mouse entered price container element");
          e.stopPropagation();

          if (tooltip._hideTimeout) {
            clearTimeout(tooltip._hideTimeout);
            delete tooltip._hideTimeout;
          }
          this.showPortalTooltip(priceContainer, tooltip);
        });

        priceContainer.addEventListener("mouseleave", (e) => {
          console.log("Mouse left price container element");
          e.stopPropagation();
          this.hidePortalTooltip(tooltip);
        });

        // Mark container as processed
        this.processedNodes.add(priceContainer);
        processedCount++;
      });

      return processedCount;
    }

    // Process nodes in chunks with async breaks
    async processNodesInChunks(nodes, chunkSize = 50) {
      let processedCount = 0;

      for (let i = 0; i < nodes.length; i += chunkSize) {
        const chunk = nodes.slice(i, i + chunkSize);

        // Process chunk synchronously
        await new Promise((resolve) => {
          requestAnimationFrame(() => {
            chunk.forEach((textNode) => {
              if (this.processTextNode(textNode)) {
                processedCount++;
              }
            });
            resolve();
          });
        });

        // Yield control back to browser between chunks
        if (i + chunkSize < nodes.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      return processedCount;
    }

    processTextNode(textNode) {
      // Double-check that this node isn't already inside our wrapper
      let parent = textNode.parentElement;
      while (parent) {
        if (
          parent.classList.contains("price-wrapper") ||
          parent.classList.contains("currency-tooltip") ||
          parent.classList.contains("cc-style-underline") ||
          parent.classList.contains("cc-style-border") ||
          parent.classList.contains("cc-style-background")
        ) {
          console.warn("Skipping already wrapped node:", textNode);
          return false;
        }
        parent = parent.parentElement;
      }

      const text = textNode.textContent;
      let hasMatch = false;

      // Find all price matches
      const matches = [];
      PRICE_PATTERNS.forEach((pattern) => {
        let match;
        pattern.lastIndex = 0; // Reset regex
        while ((match = pattern.exec(text))) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            price: this.extractPrice(match[0]),
            currency: this.extractCurrency(match[0], textNode),
          });
          hasMatch = true;
        }
      });

      if (!hasMatch || matches.length === 0) return false;

      // Sort matches by position
      matches.sort((a, b) => a.start - b.start);

      // Remove overlapping matches - keep the longer/more specific match
      const filteredMatches = [];
      for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        let shouldAdd = true;

        // Check if this match overlaps with any already added match
        for (const existing of filteredMatches) {
          if (
            (current.start >= existing.start && current.start < existing.end) ||
            (current.end > existing.start && current.end <= existing.end)
          ) {
            // Overlapping - keep the longer match
            if (current.text.length <= existing.text.length) {
              shouldAdd = false;
              break;
            } else {
              // Remove the existing shorter match
              const index = filteredMatches.indexOf(existing);
              filteredMatches.splice(index, 1);
            }
          }
        }

        if (shouldAdd) {
          filteredMatches.push(current);
        }
      }

      // Re-sort after filtering
      filteredMatches.sort((a, b) => a.start - b.start);

      // Create wrapper span for the text node
      const wrapper = document.createElement("span");
      wrapper.className = "price-wrapper";

      let lastIndex = 0;
      filteredMatches.forEach((match) => {
        // Add text before the match
        if (match.start > lastIndex) {
          wrapper.appendChild(
            document.createTextNode(text.substring(lastIndex, match.start))
          );
        }

        // Only create price element if we have a valid price
        if (match.price && match.price > 0) {
          // Create price element with tooltip
          const priceElement = this.createPriceElement(
            match.text,
            match.price,
            match.currency
          );
          wrapper.appendChild(priceElement);
        } else {
          // Just add the text without making it interactive
          wrapper.appendChild(document.createTextNode(match.text));
        }

        lastIndex = match.end;
      });

      // Add remaining text
      if (lastIndex < text.length) {
        wrapper.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      // Replace the original text node
      textNode.parentNode.replaceChild(wrapper, textNode);
      this.processedNodes.add(wrapper);

      return true;
    }

    extractPrice(priceText) {
      // Remove currency symbols and extract numeric value
      let cleanedText = priceText.replace(/[^0-9.,]/g, "");

      // If no digits found, return null
      if (!cleanedText || !cleanedText.match(/\d/)) {
        return null;
      }

      // Determine if this uses European format (comma as decimal separator)
      // European format: 1.234,56 (dots for thousands, comma for decimal)
      // US format: 1,234.56 (commas for thousands, dot for decimal)

      const dotCount = (cleanedText.match(/\./g) || []).length;
      const commaCount = (cleanedText.match(/,/g) || []).length;
      const lastDotIndex = cleanedText.lastIndexOf(".");
      const lastCommaIndex = cleanedText.lastIndexOf(",");

      let normalizedText;

      if (lastCommaIndex > lastDotIndex) {
        // Comma appears after dot, likely European format (e.g., 1.234,56)
        normalizedText = cleanedText.replace(/\./g, "").replace(",", ".");
      } else if (
        commaCount > 0 &&
        dotCount === 0 &&
        cleanedText.match(/,\d{2}$/)
      ) {
        // Only commas, and ends with ,XX - likely European format (e.g., 123,45)
        normalizedText = cleanedText.replace(",", ".");
      } else {
        // Standard format or ambiguous - treat commas as thousands separators
        normalizedText = cleanedText.replace(/,/g, "");
      }

      const price = parseFloat(normalizedText);

      // Return null for invalid prices
      return price && !isNaN(price) && price > 0 ? price : null;
    }

    // Helper function to get currencies that use a specific symbol
    getCurrenciesForSymbol(symbol) {
      const currencies = [];
      for (const [currency, currencySymbol] of Object.entries(
        CURRENCY_SYMBOLS
      )) {
        // Check if the symbol matches (considering variations like $ vs US$ vs A$)
        if (currencySymbol.includes(symbol)) {
          currencies.push(currency);
        }
      }
      return currencies;
    }

    // Helper function to check if a currency uses a specific symbol
    currencyUsesSymbol(currency, symbol) {
      const currencySymbol = CURRENCY_SYMBOLS[currency];
      if (!currencySymbol) return false;
      return currencySymbol.includes(symbol);
    }

    extractCurrency(priceText, textNode = null) {
      // Check for specific multi-character currency symbols first
      if (priceText.includes("C$")) return "CAD";
      if (priceText.includes("A$")) return "AUD";
      if (priceText.includes("NZ$")) return "NZD";
      if (priceText.includes("S$")) return "SGD";
      if (priceText.includes("HK$")) return "HKD";
      if (priceText.includes("US$")) return "USD";

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

      // If we have context (textNode), use smart nearby detection
      if (textNode) {
        const nearbyCurrency = this.detectNearbyCurrency(textNode, priceText);
        if (nearbyCurrency) {
          return nearbyCurrency;
        }
      }

      // Fall back to page-wide currency detection
      if (this.pageCurrency) {
        console.log(
          `Using page currency: ${this.pageCurrency} for price: ${priceText}`
        );
        return this.pageCurrency;
      }

      // Symbol-based detection with smart mapping
      if (priceText.includes("$")) {
        // Check if base currency uses $ symbol
        if (this.currencyUsesSymbol(this.baseCurrency, "$")) {
          console.log(
            `Base currency ${this.baseCurrency} uses $, applying it to price: ${priceText}`
          );
          return this.baseCurrency;
        }
        // Base currency doesn't use $, default to USD (most common $ currency)
        console.log(
          `Base currency ${this.baseCurrency} doesn't use $, defaulting to USD for price: ${priceText}`
        );
        return "USD";
      }

      if (priceText.includes("€")) return "EUR"; // Euro is unique
      if (priceText.includes("£")) return "GBP"; // Pound is unique

      if (priceText.includes("¥")) {
        // ¥ could be JPY or CNY
        if (this.baseCurrency === "JPY" || this.baseCurrency === "CNY") {
          return this.baseCurrency;
        }
        return "JPY"; // Default to JPY (more common internationally)
      }

      if (priceText.includes("₹")) return "INR"; // Rupee is unique
      if (priceText.includes("₩")) return "KRW"; // Won is unique
      if (priceText.includes("₺")) return "TRY"; // Lira is unique
      if (priceText.includes("₪")) return "ILS"; // Shekel is unique
      if (priceText.includes("฿")) return "THB"; // Baht is unique
      if (priceText.includes("₱")) return "PHP"; // Peso is unique

      if (priceText.includes("kr")) {
        // kr is used by SEK, NOK, DKK, ISK
        if (["SEK", "NOK", "DKK", "ISK"].includes(this.baseCurrency)) {
          return this.baseCurrency;
        }
        return "SEK"; // Default to SEK (Swedish Krona)
      }

      if (priceText.includes("R$")) return "BRL"; // Brazilian Real
      if (priceText.includes("R") && priceText.match(/R\s*\d/)) {
        // R followed by number could be ZAR
        if (this.baseCurrency === "ZAR") return "ZAR";
        // Don't assume ZAR without more context
      }

      // Final fallback to user's base currency
      console.log(
        `No currency detected for price: ${priceText}, using base currency: ${this.baseCurrency}`
      );
      return this.baseCurrency;
    }

    createPriceElement(originalText, price, detectedCurrency) {
      const span = document.createElement("span");
      // Don't set a default class - it will be set by applyAppearanceToElement
      span.textContent = originalText;

      // Apply current appearance settings
      this.applyAppearanceToElement(span);

      // Create tooltip (will be portaled to body)
      const tooltip = this.createTooltip(price, detectedCurrency);

      // Store tooltip reference on the span for cleanup
      span._tooltip = tooltip;

      // Show/hide tooltip on hover with portal positioning
      span.addEventListener("mouseenter", (e) => {
        console.log("Mouse entered price element:", originalText);
        // Stop propagation to prevent parent elements from also showing tooltips
        e.stopPropagation();

        // Cancel any pending hide operation
        if (tooltip._hideTimeout) {
          clearTimeout(tooltip._hideTimeout);
          delete tooltip._hideTimeout;
        }
        this.showPortalTooltip(span, tooltip);
      });

      span.addEventListener("mouseleave", (e) => {
        console.log("Mouse left price element:", originalText);
        // Stop propagation to prevent parent elements from also hiding tooltips
        e.stopPropagation();
        this.hidePortalTooltip(tooltip);
      });

      return span;
    }

    createTooltip(price, fromCurrency) {
      // Don't create tooltip for invalid prices or when price is 0
      if (!price || isNaN(price) || price <= 0 || !isFinite(price)) {
        console.log("Skipping tooltip creation for invalid price:", price);
        return null;
      }

      const tooltip = document.createElement("div");
      tooltip.className = "currency-tooltip portal-tooltip";

      // Apply tooltip theme
      this.applyTooltipTheme(tooltip);

      // Set initial portal styles
      this.applyPortalStyles(tooltip);

      // Calculate conversions synchronously
      const conversions = this.calculateConversions(price, fromCurrency);

      console.log(
        "Creating tooltip for:",
        price,
        fromCurrency,
        "Conversions:",
        conversions
      );

      // Create header showing detected currency
      const fromSymbol = CURRENCY_SYMBOLS[fromCurrency] || "";
      const symbolOnlyCurrencies = ["USD", "CAD", "AUD", "NZD", "SGD", "HKD"];

      // Use more decimal places for cryptocurrencies
      const isCrypto = SUPPORTED_CRYPTO_CURRENCIES.includes(fromCurrency);
      const decimalPlaces = isCrypto ? 8 : 2;

      // Format the price with thousands separator
      const parts = price.toFixed(decimalPlaces).split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const formattedPrice = parts.join(".");

      let fromDisplay;
      if (fromSymbol && symbolOnlyCurrencies.includes(fromCurrency)) {
        fromDisplay = `${fromSymbol} ${formattedPrice}`;
      } else if (fromSymbol) {
        fromDisplay = `${fromCurrency} ${fromSymbol} ${formattedPrice}`;
      } else {
        fromDisplay = `${fromCurrency} ${formattedPrice}`;
      }

      let tooltipContent = `
      <div class="tooltip-header">
        <div class="detected-currency">${fromDisplay}</div>
        <div class="conversion-label">${
          conversions.length > 0 ? "converts to:" : ""
        }</div>
      </div>
    `;

      if (conversions.length > 0) {
        tooltipContent += '<div class="conversion-list">';
        tooltipContent += conversions
          .sort((a, b) => {
            const nameA =
              FIAT_CURRENCY_NAMES[a.currency] ||
              CRYPTO_SYMBOL_TO_NAME[a.currency] ||
              a.currency;
            const nameB =
              FIAT_CURRENCY_NAMES[b.currency] ||
              CRYPTO_SYMBOL_TO_NAME[b.currency] ||
              b.currency;
            return nameA.localeCompare(nameB);
          })
          .map((conv) => {
            const currencyName =
              FIAT_CURRENCY_NAMES[conv.currency] ||
              CRYPTO_SYMBOL_TO_NAME[conv.currency] ||
              conv.currency;
            return `
            <div class="conversion-item">
              <span class="currency-amount">${this.formatCurrency(
                conv.amount,
                conv.currency,
                true
              )}</span>
              <span class="currency-name">${currencyName}</span>
            </div>
          `;
          })
          .join("");
        tooltipContent += "</div>";
      } else {
        tooltipContent +=
          '<div class="no-conversions">No conversions available</div>';
      }

      tooltip.innerHTML = tooltipContent;

      // Don't append to DOM yet - will be portaled on hover
      return tooltip;
    }

    calculateConversions(amount, fromCurrency) {
      const conversions = [];

      // Validate input amount
      if (!amount || isNaN(amount) || !isFinite(amount)) {
        console.warn("Invalid amount for conversion:", amount);
        return conversions;
      }

      // Use local exchange rates for fast conversions
      for (const toCurrency of this.selectedCurrencies) {
        if (toCurrency === fromCurrency) {
          continue; // Skip same currency conversion
        }

        const fromRate = this.getUsdRate(fromCurrency);
        const toRate = this.getUsdRate(toCurrency);

        if (fromRate !== null && toRate !== null && fromRate !== 0) {
          const convertedAmount = amount * (toRate / fromRate);

          // Validate the conversion result
          if (isFinite(convertedAmount) && !isNaN(convertedAmount)) {
            conversions.push({
              currency: toCurrency,
              amount: convertedAmount,
            });
          }
        }
      }

      return conversions;
    }

    getUsdRate(currency) {
      // USD is always 1
      if (currency === "USD") {
        return 1;
      }

      // Special case for BTC_SATS - use BTC rate
      if (currency === "BTC_SATS") {
        return this.exchangeRates["BTC"] || null;
      }

      // Return the rate if available
      return this.exchangeRates[currency] || null;
    }

    formatCurrency(amount, currency, forTooltipConversion = false) {
      // Validate the amount parameter
      if (
        amount === null ||
        amount === undefined ||
        isNaN(amount) ||
        !isFinite(amount)
      ) {
        console.warn(
          "Invalid amount for currency formatting:",
          amount,
          currency
        );
        return `-- ${currency}`;
      }

      // Handle Bitcoin denomination
      if (currency === "BTC" && this.btcDenomination) {
        if (this.btcDenomination === "sats") {
          // Convert to satoshis (1 BTC = 100,000,000 sats)
          const sats = Math.round(amount * 100000000);
          return `${sats.toLocaleString()} sats`;
        } else if (this.btcDenomination === "dynamic") {
          // Show BTC for prices ≥0.01 BTC, sats otherwise
          if (amount >= 0.01) {
            // Continue with normal BTC formatting
          } else {
            // Convert to sats
            const sats = Math.round(amount * 100000000);
            return `${sats.toLocaleString()} sats`;
          }
        }
      }

      // Handle BTC_SATS - always show both BTC and sats
      if (currency === "BTC_SATS") {
        const sats = Math.round(amount * 100000000);
        const btcFormatted = amount.toFixed(8).replace(/\.?0+$/, "");
        return `₿${btcFormatted} (${sats.toLocaleString()} sats)`;
      }

      const symbol = CURRENCY_SYMBOLS[currency] || "";

      // Use more decimal places for cryptocurrencies
      const isCrypto = SUPPORTED_CRYPTO_CURRENCIES.includes(currency);
      const decimalPlaces = isCrypto ? 8 : 2;

      // Format number with thousands separator
      const parts = Number(amount).toFixed(decimalPlaces).split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const formatted = parts.join(".");

      // For certain currencies, show only the symbol without the currency code
      const symbolOnlyCurrencies = ["USD", "CAD", "AUD", "NZD", "SGD", "HKD"];

      if (symbol) {
        if (symbolOnlyCurrencies.includes(currency)) {
          // Always just show symbol + amount for these currencies
          return `${symbol} ${formatted}`;
        } else {
          // For tooltip conversions, only show symbol + amount (no currency code)
          // For headers, show currency code + symbol + amount
          if (forTooltipConversion) {
            return `${symbol} ${formatted}`;
          } else {
            return `${currency} ${symbol}${formatted}`;
          }
        }
      } else {
        return `${currency} ${formatted}`;
      }
    }

    // Set up periodic cleanup to catch stuck tooltips
    setupPeriodicCleanup() {
      // Run cleanup every 10 seconds to catch any stuck tooltips (less aggressive)
      setInterval(() => {
        // Only run cleanup if there are no visible tooltips to avoid interfering with active ones
        const visibleTooltips = document.querySelectorAll(
          ".portal-tooltip[style*='opacity: 1']"
        );
        if (visibleTooltips.length === 0) {
          this.cleanupOrphanedTooltips();
        }
      }, 10000);
    }

    // Clean up orphaned tooltips that may be stuck on the page
    cleanupOrphanedTooltips() {
      const allTooltips = document.querySelectorAll(".portal-tooltip");
      const orphanedTooltips = [];

      allTooltips.forEach((tooltip) => {
        // Check if this tooltip has a valid target element that still exists in the DOM
        const targetElement = tooltip._targetElement;

        if (!targetElement || !document.body.contains(targetElement)) {
          // Target element is missing or removed from DOM - this is orphaned
          orphanedTooltips.push(tooltip);
        } else {
          // Check if the target element still has a reference to this tooltip
          const priceElements = document.querySelectorAll(
            ".cc-style-underline, .cc-style-border, .cc-style-background"
          );
          let hasValidReference = false;

          priceElements.forEach((priceEl) => {
            if (priceEl._tooltip === tooltip) {
              hasValidReference = true;
            }
          });

          if (!hasValidReference) {
            // No price element references this tooltip anymore - it's orphaned
            orphanedTooltips.push(tooltip);
          }
        }
      });

      if (orphanedTooltips.length > 0) {
        console.log(
          `Found ${orphanedTooltips.length} orphaned tooltips, removing...`
        );
        orphanedTooltips.forEach((tooltip) => {
          this.stopTooltipPositionTracking(tooltip);
          // Clear any pending hide timeout
          if (tooltip._hideTimeout) {
            clearTimeout(tooltip._hideTimeout);
            delete tooltip._hideTimeout;
          }
          if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
          }
        });
      }
    }

    removeAllTooltips() {
      console.log("Removing all tooltips and cleaning up...");

      // Clean up any portal tooltips still in body - this catches orphaned tooltips
      this.cleanupOrphanedTooltips();

      // Remove all price wrappers we've added
      document.querySelectorAll(".price-wrapper").forEach((wrapper) => {
        // Clean up tooltip references from price elements
        wrapper
          .querySelectorAll(
            ".cc-style-underline, .cc-style-border, .cc-style-background"
          )
          .forEach((priceEl) => {
            if (priceEl._tooltip) {
              this.stopTooltipPositionTracking(priceEl._tooltip);
              // Clear any pending hide timeout
              if (priceEl._tooltip._hideTimeout) {
                clearTimeout(priceEl._tooltip._hideTimeout);
                delete priceEl._tooltip._hideTimeout;
              }
              if (priceEl._tooltip.parentNode) {
                priceEl._tooltip.parentNode.removeChild(priceEl._tooltip);
              }
              delete priceEl._tooltip;
            }
          });

        // Extract only the text content, excluding tooltips
        let text = "";
        wrapper.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          } else if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node.classList.contains("cc-style-underline") ||
              node.classList.contains("cc-style-border") ||
              node.classList.contains("cc-style-background"))
          ) {
            // Get the original price text without the tooltip
            let originalText = "";
            node.childNodes.forEach((childNode) => {
              if (childNode.nodeType === Node.TEXT_NODE) {
                originalText += childNode.textContent;
              }
              // Skip tooltip divs
            });
            text += originalText;
          }
        });

        const textNode = document.createTextNode(text);
        wrapper.parentNode.replaceChild(textNode, wrapper);
      });

      // Clear processed nodes
      this.processedNodes = new WeakSet();

      // Clean up style observer
      if (this.styleObserver) {
        this.styleObserver.disconnect();
        this.styleObserver = null;
      }

      console.log("Cleared all tooltips and wrappers");
    }

    // Inject dynamic styles into the page
    injectDynamicStyles() {
      console.log("===== INJECTING DYNAMIC STYLES =====");
      console.log(
        "Appearance settings:",
        JSON.stringify(this.appearance, null, 2)
      );

      // Remove existing styles if present
      const existingStyle = document.getElementById(
        "currency-converter-dynamic-styles"
      );
      if (existingStyle) {
        console.log("Removing existing dynamic styles");
        existingStyle.remove();
      }

      const borderColor = this.appearance.borderColor || "#007bff";
      const borderHoverColor = this.appearance.borderHoverColor || "#218838";
      const backgroundColor = this.appearance.backgroundColor || "#007bff";
      const backgroundHoverColor =
        this.appearance.backgroundHoverColor || "#218838";

      const bgColorRgba = this.hexToRgba(
        backgroundColor,
        this.appearance.backgroundOpacity / 100
      );
      const bgHoverColorRgba = this.hexToRgba(
        backgroundHoverColor,
        this.appearance.backgroundOpacity / 100
      );

      const style = document.createElement("style");
      style.id = "currency-converter-dynamic-styles";
      style.textContent = `
            /* Set CSS variables on all elements to ensure they're available */
            :root, *, body * {
                --cc-border-color: ${borderColor} !important;
                --cc-border-hover-color: ${borderHoverColor} !important;
                --cc-background-color: ${backgroundColor} !important;
                --cc-background-hover-color: ${backgroundHoverColor} !important;
                --cc-border-thickness: ${
                  this.appearance.borderThickness
                }px !important;
                --cc-border-radius: ${
                  this.appearance.borderRadius || 0
                }px !important;
                --cc-border-style: ${this.appearance.borderStyle} !important;
                --cc-background-color-rgba: ${bgColorRgba} !important;
                --cc-background-hover-color-rgba: ${bgHoverColorRgba} !important;
            }
            
            /* Direct style application with highest specificity */
            body .cc-style-underline {
                background: ${bgColorRgba} !important;
                background-color: ${bgColorRgba} !important;
                border-bottom: ${this.appearance.borderThickness}px ${
                  this.appearance.borderStyle
                } ${borderColor} !important;
                border-radius: ${
                  this.appearance.borderRadius || 0
                }px !important;
            }
            
            body .cc-style-underline:hover {
                background: ${bgHoverColorRgba} !important;
                background-color: ${bgHoverColorRgba} !important;
                border-bottom-color: ${borderHoverColor} !important;
            }
            
            body .cc-style-border {
                background: ${bgColorRgba} !important;
                background-color: ${bgColorRgba} !important;
                border: ${this.appearance.borderThickness}px ${
                  this.appearance.borderStyle
                } ${borderColor} !important;
                border-radius: ${
                  this.appearance.borderRadius || 0
                }px !important;
            }
            
            body .cc-style-border:hover {
                background: ${bgHoverColorRgba} !important;
                background-color: ${bgHoverColorRgba} !important;
                border-color: ${borderHoverColor} !important;
            }
            
            body .cc-style-background {
                background: ${bgColorRgba} !important;
                background-color: ${bgColorRgba} !important;
                border: none !important;
                border-radius: ${
                  this.appearance.borderRadius || 0
                }px !important;
            }
            
            body .cc-style-background:hover {
                background: ${bgHoverColorRgba} !important;
                background-color: ${bgHoverColorRgba} !important;
            }
            
            /* Extra specificity to override content.css */
            html body .price-wrapper .cc-style-underline,
            html body .price-wrapper .cc-style-border,
            html body .price-wrapper .cc-style-background {
                background: ${bgColorRgba} !important;
                background-color: ${bgColorRgba} !important;
            }
            
            html body .price-wrapper .cc-style-underline:hover,
            html body .price-wrapper .cc-style-border:hover,
            html body .price-wrapper .cc-style-background:hover {
                background: ${bgHoverColorRgba} !important;
                background-color: ${bgHoverColorRgba} !important;
            }
        `;

      // Append to document.head but after all other styles for higher priority
      if (document.head) {
        document.head.appendChild(style);
      } else {
        // Fallback if head is empty
        document.documentElement.appendChild(style);
      }

      console.log("Dynamic styles injected, verifying...");
      console.log("Style element ID:", style.id);
      console.log(
        "Style content (first 200 chars):",
        style.textContent.substring(0, 200)
      );

      // Setup observer to ensure our styles stay last
      this.ensureStylePriority();

      // Verify the style element exists in DOM
      setTimeout(() => {
        const verifyStyle = document.getElementById(
          "currency-converter-dynamic-styles"
        );
        console.log("Style element found in DOM:", !!verifyStyle);
        if (verifyStyle) {
          console.log("Style element parent:", verifyStyle.parentNode?.tagName);
          console.log(
            "Style element is last child:",
            verifyStyle === verifyStyle.parentNode.lastElementChild
          );

          // Check all stylesheets to see order
          console.log("Current stylesheet order:");
          Array.from(document.styleSheets).forEach((sheet, index) => {
            try {
              const isOurs =
                sheet.ownerNode?.id === "currency-converter-dynamic-styles";
              console.log(
                `  Sheet ${index}: ${
                  sheet.href || (isOurs ? "OUR DYNAMIC STYLES" : "inline style")
                }`
              );
            } catch (e) {
              console.log(`  Sheet ${index}: (cross-origin or inaccessible)`);
            }
          });
        }
      }, 100);
    }

    // Ensure our dynamic styles always stay last for highest priority
    ensureStylePriority() {
      if (this.styleObserver) {
        this.styleObserver.disconnect();
      }

      this.styleObserver = new MutationObserver(() => {
        const ourStyle = document.getElementById(
          "currency-converter-dynamic-styles"
        );
        if (
          ourStyle &&
          ourStyle.parentNode &&
          ourStyle !== ourStyle.parentNode.lastElementChild
        ) {
          console.log("Dynamic styles were not last, moving to end...");
          ourStyle.parentNode.appendChild(ourStyle);
        }
      });

      // Watch for new stylesheets being added
      if (document.head) {
        this.styleObserver.observe(document.head, {
          childList: true,
          subtree: false,
        });
      }
    }

    // Update dynamic styles when appearance changes
    updateDynamicStyles() {
      console.log("Updating dynamic styles...");
      // Just re-inject the styles with new values
      this.injectDynamicStyles();
    }

    // Apply appearance to a price element
    applyAppearanceToElement(element) {
      // Clear any existing styling classes
      element.classList.remove(
        "cc-style-underline",
        "cc-style-border",
        "cc-style-background"
      );

      // Apply highlight style
      element.classList.add(`cc-style-${this.appearance.highlightStyle}`);

      // Apply inline styles for immediate effect
      this.applyInlineStyles(element);
    }

    // Apply inline styles for compatibility
    applyInlineStyles(element) {
      // Only apply essential inline styles that can't be handled by CSS
      element.style.padding = "1px 2px";
      element.style.position = "relative";
      element.style.cursor = "help";
      element.style.display = "inline-block";

      // Remove any inline styles that would override our dynamic CSS
      element.style.removeProperty("background");
      element.style.removeProperty("background-color");
      element.style.removeProperty("border");
      element.style.removeProperty("border-bottom");
      element.style.removeProperty("border-radius");

      // Force a repaint to ensure CSS is applied
      void element.offsetHeight;

      // Log for debugging
      const computedStyle = window.getComputedStyle(element);
      console.log("Applied styles to element:", {
        text: element.textContent.substring(0, 30),
        classes: element.className,
        computedBackground: computedStyle.backgroundColor,
        computedBorder: computedStyle.border || computedStyle.borderBottom,
      });
    }

    // Apply portal-specific styles for body-positioned tooltips
    applyPortalStyles(tooltip) {
      // Force override all existing styles completely
      tooltip.style.cssText = "";

      // Main tooltip container styles with !important to override any conflicting CSS
      tooltip.style.setProperty("position", "fixed", "important");
      tooltip.style.setProperty("zIndex", "2147483647", "important");
      tooltip.style.setProperty("pointerEvents", "none", "important");
      tooltip.style.setProperty("opacity", "0", "important");
      tooltip.style.setProperty("transition", "none", "important"); // Disable transitions during setup
      tooltip.style.setProperty("maxWidth", "300px", "important");
      tooltip.style.setProperty("minWidth", "150px", "important");
      tooltip.style.setProperty("width", "auto", "important");
      tooltip.style.setProperty("height", "auto", "important");
      tooltip.style.setProperty("maxHeight", "none", "important");
      tooltip.style.setProperty("minHeight", "auto", "important");
      tooltip.style.setProperty("padding", "12px", "important");
      tooltip.style.setProperty("borderRadius", "6px", "important");
      tooltip.style.setProperty("fontSize", "14px", "important");
      tooltip.style.setProperty("lineHeight", "1.4", "important");
      tooltip.style.setProperty(
        "boxShadow",
        "0 4px 12px rgba(0,0,0,0.15)",
        "important"
      );
      tooltip.style.setProperty("visibility", "visible", "important");
      tooltip.style.setProperty("display", "block", "important");
      tooltip.style.setProperty("boxSizing", "border-box", "important");
      tooltip.style.setProperty("wordWrap", "break-word", "important");
      tooltip.style.setProperty("whiteSpace", "normal", "important");
      tooltip.style.setProperty("overflow", "visible", "important");
      tooltip.style.setProperty("transform", "none", "important");
      tooltip.style.setProperty("left", "0px", "important");
      tooltip.style.setProperty("top", "0px", "important");
      tooltip.style.setProperty("right", "auto", "important");
      tooltip.style.setProperty("bottom", "auto", "important");
      tooltip.style.setProperty("margin", "0px", "important");
      tooltip.style.setProperty("border", "none", "important");

      // Apply theme after basic styles
      this.applyTooltipTheme(tooltip);

      // Add comprehensive CSS to ensure inner elements display correctly
      const style = document.createElement("style");
      style.id = "portal-tooltip-styles";
      if (!document.getElementById("portal-tooltip-styles")) {
        style.textContent = `
        .portal-tooltip * {
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 !important;
          float: none !important;
          position: static !important;
          transform: none !important;
        }
        .portal-tooltip .tooltip-header {
          display: block !important;
          margin-bottom: 8px !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
        }
        .portal-tooltip .detected-currency {
          display: block !important;
          font-weight: bold !important;
          color: #007bff !important;
          margin-bottom: 4px !important;
          height: auto !important;
          line-height: 1.2 !important;
        }
        .portal-tooltip .conversion-label {
          display: block !important;
          font-size: 12px !important;
          opacity: 0.8 !important;
          margin-bottom: 4px !important;
          height: auto !important;
          line-height: 1.2 !important;
        }
        .portal-tooltip .conversion-list {
          display: block !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
        .portal-tooltip .conversion-item {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: 3px 0 !important;
          width: 100% !important;
          height: auto !important;
          min-height: 20px !important;
          line-height: 1.2 !important;
          flex-shrink: 0 !important;
        }
        .portal-tooltip .currency-amount {
          display: inline-block !important;
          font-weight: 500 !important;
          flex: 1 !important;
          height: auto !important;
          line-height: 1.2 !important;
        }
        .portal-tooltip .currency-name {
          display: inline-block !important;
          font-size: 11px !important;
          opacity: 0.7 !important;
          text-align: right !important;
          margin-left: 8px !important;
          height: auto !important;
          line-height: 1.2 !important;
          flex-shrink: 0 !important;
        }
        .portal-tooltip .no-conversions {
          display: block !important;
          font-style: italic !important;
          opacity: 0.6 !important;
          height: auto !important;
          line-height: 1.2 !important;
        }
        
        /* Arrow for portal tooltip - default position (above price) */
        .portal-tooltip::after {
          content: '' !important;
          position: absolute !important;
          top: 100% !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          border: 6px solid transparent !important;
          border-top-color: rgba(0, 0, 0, 0.95) !important;
        }
        
        /* Arrow when tooltip is positioned below the price */
        .portal-tooltip.positioned-below::after {
          top: auto !important;
          bottom: 100% !important;
          border-top-color: transparent !important;
          border-bottom-color: rgba(0, 0, 0, 0.95) !important;
        }
        
        /* Adjust arrow color for light theme */
        .portal-tooltip[style*="background: rgba(255, 255, 255"]::after,
        .portal-tooltip.tooltip-theme-light::after {
          border-top-color: rgba(255, 255, 255, 1) !important;
        }
        
        .portal-tooltip.positioned-below[style*="background: rgba(255, 255, 255"]::after,
        .portal-tooltip.positioned-below.tooltip-theme-light::after {
          border-top-color: transparent !important;
          border-bottom-color: rgba(255, 255, 255, 1) !important;
        }
        
        /* Dark theme arrow (explicit) */
        .portal-tooltip.tooltip-theme-dark::after {
          border-top-color: rgba(0, 0, 0, 1) !important;
        }
        
        .portal-tooltip.positioned-below.tooltip-theme-dark::after {
          border-top-color: transparent !important;
          border-bottom-color: rgba(0, 0, 0, 1) !important;
        }
        
        /* Light theme styles */
        .portal-tooltip.tooltip-theme-light .tooltip-header {
          border-bottom-color: rgba(0, 0, 0, 0.1) !important;
        }
        
        .portal-tooltip.tooltip-theme-light .detected-currency {
          color: #0066cc !important;
        }
        
        .portal-tooltip.tooltip-theme-light .conversion-label {
          color: rgba(0, 0, 0, 0.75) !important;
        }
        
        .portal-tooltip.tooltip-theme-light .currency-amount {
          color: #2e7d32 !important;
        }
        
        .portal-tooltip.tooltip-theme-light .currency-name {
          color: rgba(0, 0, 0, 0.7) !important;
        }
        
        .portal-tooltip.tooltip-theme-light .no-conversions {
          color: #f57c00 !important;
        }
        
        .portal-tooltip.tooltip-theme-light .conversion-item:hover {
          background: rgba(0, 0, 0, 0.05) !important;
        }
        
        /* Dark theme styles (default) */
        .portal-tooltip.tooltip-theme-dark .tooltip-header {
          border-bottom-color: rgba(255, 255, 255, 0.15) !important;
        }
        
        .portal-tooltip.tooltip-theme-dark .detected-currency {
          color: #4fc3f7 !important;
        }
        
        .portal-tooltip.tooltip-theme-dark .conversion-label {
          color: rgba(255, 255, 255, 0.7) !important;
        }
        
        .portal-tooltip.tooltip-theme-dark .currency-amount {
          color: #81c784 !important;
        }
        
        .portal-tooltip.tooltip-theme-dark .currency-name {
          color: rgba(255, 255, 255, 0.65) !important;
        }
        
        .portal-tooltip.tooltip-theme-dark .no-conversions {
          color: #ffab40 !important;
        }
        
        .portal-tooltip.tooltip-theme-dark .conversion-item:hover {
          background: rgba(255, 255, 255, 0.08) !important;
        }
      `;
        document.head.appendChild(style);
      }
    }

    // Show portal tooltip positioned relative to target element
    showPortalTooltip(targetElement, tooltip) {
      // Cancel any pending hide operation first
      if (tooltip._hideTimeout) {
        clearTimeout(tooltip._hideTimeout);
        delete tooltip._hideTimeout;
      }

      // If tooltip is already in DOM and visible, don't recreate
      if (tooltip.parentNode && tooltip.style.opacity === "1") {
        return;
      }

      // Hide any other visible tooltips first to prevent stacking
      document
        .querySelectorAll(".currency-tooltip.portal-tooltip")
        .forEach((existingTooltip) => {
          if (
            existingTooltip !== tooltip &&
            existingTooltip.style.opacity === "1"
          ) {
            this.hidePortalTooltip(existingTooltip);
          }
        });

      // Position tooltip (this also adds it to DOM if needed)
      this.positionPortalTooltip(targetElement, tooltip);

      // Show tooltip with forced opacity after positioning is complete
      console.log("Showing tooltip");

      // Force show the tooltip immediately after positioning
      setTimeout(() => {
        // Double-check that we should still show (haven't been cancelled)
        if (tooltip._hideTimeout) {
          return; // Hide was requested, don't show
        }

        // Force all styles that could interfere with visibility
        tooltip.style.setProperty("opacity", "1", "important");
        tooltip.style.setProperty("visibility", "visible", "important");
        tooltip.style.setProperty("display", "block", "important");
        tooltip.style.setProperty("transform", "none", "important");
        tooltip.style.setProperty(
          "transition",
          "opacity 0.2s ease",
          "important"
        ); // Re-enable transition after setup

        // Force a reflow to ensure styles are applied
        tooltip.offsetHeight;

        console.log("Tooltip forced visible, computed styles:", {
          opacity: getComputedStyle(tooltip).opacity,
          visibility: getComputedStyle(tooltip).visibility,
          display: getComputedStyle(tooltip).display,
          position: getComputedStyle(tooltip).position,
          left: getComputedStyle(tooltip).left,
          top: getComputedStyle(tooltip).top,
          transform: getComputedStyle(tooltip).transform,
          zIndex: getComputedStyle(tooltip).zIndex,
          width: getComputedStyle(tooltip).width,
          height: getComputedStyle(tooltip).height,
        });
      }, 50);

      // Update position on scroll/resize
      this.startTooltipPositionTracking(targetElement, tooltip);
    }

    // Hide portal tooltip
    hidePortalTooltip(tooltip) {
      if (!tooltip.parentNode) return;

      // Stop position tracking
      this.stopTooltipPositionTracking(tooltip);

      // Hide with animation
      tooltip.style.opacity = "0";

      // Store timeout reference so it can be cancelled if needed
      tooltip._hideTimeout = setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
        delete tooltip._hideTimeout;
      }, 200);
    }

    // Position tooltip relative to target element
    positionPortalTooltip(targetElement, tooltip) {
      const targetRect = targetElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      console.log("Target rect:", targetRect);

      // First, ensure tooltip is added to DOM and properly styled
      if (!tooltip.parentNode) {
        document.body.appendChild(tooltip);
      }

      // Apply portal styles to ensure proper rendering
      this.applyPortalStyles(tooltip);

      // Position off-screen for measurement but keep it properly styled
      tooltip.style.setProperty("left", "-9999px", "important");
      tooltip.style.setProperty("top", "0px", "important");
      tooltip.style.setProperty("opacity", "0", "important");
      tooltip.style.setProperty("visibility", "visible", "important");
      tooltip.style.setProperty("display", "block", "important");
      tooltip.style.setProperty("position", "fixed", "important");

      // Force multiple reflows to ensure accurate measurement
      tooltip.offsetHeight;
      tooltip.offsetWidth;

      // Wait multiple animation frames to ensure CSS is fully applied
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Force another reflow after CSS has been applied
            tooltip.offsetHeight;

            // Debug inner element measurements
            const headerEl = tooltip.querySelector(".tooltip-header");
            const listEl = tooltip.querySelector(".conversion-list");
            const items = tooltip.querySelectorAll(".conversion-item");

            console.log("Debugging inner elements:", {
              header: headerEl
                ? {
                    height: headerEl.offsetHeight,
                    computedHeight: getComputedStyle(headerEl).height,
                    display: getComputedStyle(headerEl).display,
                  }
                : "not found",
              list: listEl
                ? {
                    height: listEl.offsetHeight,
                    computedHeight: getComputedStyle(listEl).height,
                    display: getComputedStyle(listEl).display,
                    childCount: listEl.children.length,
                  }
                : "not found",
              items: Array.from(items).map((item, i) => ({
                index: i,
                height: item.offsetHeight,
                computedHeight: getComputedStyle(item).height,
                display: getComputedStyle(item).display,
                text: item.textContent,
              })),
            });

            // Calculate expected height manually
            let expectedHeight = 12 * 2; // padding
            if (headerEl) expectedHeight += headerEl.offsetHeight;
            if (listEl) {
              expectedHeight += listEl.offsetHeight;
              // If list height is 0, calculate based on items
              if (listEl.offsetHeight === 0 && items.length > 0) {
                expectedHeight += items.length * 25; // Approximate item height
              }
            }

            // Now measure the tooltip
            const tooltipRect = tooltip.getBoundingClientRect();
            const tooltipWidth = tooltipRect.width;
            const tooltipHeight = tooltipRect.height;

            console.log("Tooltip measurements:", {
              width: tooltipWidth,
              height: tooltipHeight,
              expectedHeight: expectedHeight,
              computedHeight: getComputedStyle(tooltip).height,
              scrollHeight: tooltip.scrollHeight,
              offsetHeight: tooltip.offsetHeight,
              offsetWidth: tooltip.offsetWidth,
              scrollWidth: tooltip.scrollWidth,
              boundingRect: tooltipRect,
            });
            console.log("Tooltip content HTML:", tooltip.innerHTML);

            // Use multiple width measurements to ensure accuracy
            const widthMeasurements = {
              boundingRect: tooltipRect.width,
              offsetWidth: tooltip.offsetWidth,
              scrollWidth: tooltip.scrollWidth,
              computedWidth: parseFloat(getComputedStyle(tooltip).width),
            };
            console.log("Width measurements:", widthMeasurements);

            // Use the most reliable width measurement
            let finalWidth = Math.max(
              tooltipRect.width,
              tooltip.offsetWidth,
              tooltip.scrollWidth
            );

            // If all measurements are too small, use fallback
            if (finalWidth < 50) {
              finalWidth = 200;
            }

            let finalHeight = tooltipHeight;

            if (tooltipHeight < expectedHeight * 0.5) {
              console.warn(
                "Tooltip height too small, using scrollHeight or expected height"
              );
              finalHeight = Math.max(tooltip.scrollHeight, expectedHeight, 80);
              // Force the height on the tooltip
              tooltip.style.setProperty(
                "height",
                `${finalHeight}px`,
                "important"
              );
              tooltip.style.setProperty(
                "minHeight",
                `${finalHeight}px`,
                "important"
              );
            }

            console.log("Using dimensions:", {
              width: finalWidth,
              height: finalHeight,
            });

            // Calculate exact midpoint of target element
            const targetMidpointX = targetRect.left + targetRect.width / 2;
            const tooltipMidpointX = finalWidth / 2;

            // Position tooltip so its midpoint aligns with target's midpoint
            let left = targetMidpointX - tooltipMidpointX;
            let top = targetRect.top - finalHeight - 12; // 12px gap above target

            console.log("Target element:", {
              left: targetRect.left,
              width: targetRect.width,
              midpoint: targetMidpointX,
            });
            console.log("Tooltip calculations:", {
              width: finalWidth,
              halfWidth: tooltipMidpointX,
              calculatedLeft: left,
            });
            console.log("Initial position:", { left, top });

            // Adjust horizontal position to stay in viewport
            const padding = 10;
            if (left < padding) {
              left = padding;
            } else if (left + finalWidth > viewportWidth - padding) {
              left = viewportWidth - finalWidth - padding;
            }

            // Adjust vertical position if tooltip would go off-screen
            let isPositionedBelow = false;
            if (top < padding) {
              // Position below target instead
              top = targetRect.bottom + 12;
              isPositionedBelow = true;
              console.log("Positioning below target:", top);
            }

            // Add or remove the 'below' class based on position
            if (isPositionedBelow) {
              tooltip.classList.add("positioned-below");
            } else {
              tooltip.classList.remove("positioned-below");
            }

            console.log("Final position:", { left, top });

            // Apply final position with !important to override any CSS
            tooltip.style.setProperty("left", `${left}px`, "important");
            tooltip.style.setProperty("top", `${top}px`, "important");
            tooltip.style.setProperty("transform", "none", "important"); // Force no transform
            tooltip.style.setProperty("margin", "0px", "important"); // Force no margin

            console.log("Final position applied:", { left, top });

            // Force a reflow to ensure positioning is applied
            tooltip.offsetHeight;
          });
        });
      });
    }

    // Start tracking tooltip position for scroll/resize events
    startTooltipPositionTracking(targetElement, tooltip) {
      // Store tracking info on tooltip
      tooltip._targetElement = targetElement;
      tooltip._positionHandler = () => {
        // Check if element is still in the DOM and visible
        if (
          !document.body.contains(targetElement) ||
          !targetElement.offsetParent
        ) {
          console.log("Target element removed from DOM, hiding tooltip");
          this.hidePortalTooltip(tooltip);
        } else {
          this.positionPortalTooltip(targetElement, tooltip);
        }
      };

      // Add event listeners
      window.addEventListener("scroll", tooltip._positionHandler, {
        passive: true,
      });
      window.addEventListener("resize", tooltip._positionHandler, {
        passive: true,
      });
    }

    // Stop tracking tooltip position
    stopTooltipPositionTracking(tooltip) {
      if (tooltip._positionHandler) {
        window.removeEventListener("scroll", tooltip._positionHandler);
        window.removeEventListener("resize", tooltip._positionHandler);
        delete tooltip._positionHandler;
        delete tooltip._targetElement;
      }
    }

    // Apply tooltip theme
    applyTooltipTheme(tooltip) {
      // Remove any existing theme classes
      tooltip.classList.remove("tooltip-theme-light", "tooltip-theme-dark");

      if (this.appearance.tooltipTheme === "light") {
        tooltip.classList.add("tooltip-theme-light");
        tooltip.style.setProperty(
          "background",
          "rgba(255, 255, 255, 1)",
          "important"
        );
        tooltip.style.setProperty("color", "#333", "important");
        tooltip.style.setProperty("border", "1px solid #ccc", "important");
      } else {
        // Default to dark
        tooltip.classList.add("tooltip-theme-dark");
        tooltip.style.setProperty(
          "background",
          "rgba(0, 0, 0, 1)",
          "important"
        );
        tooltip.style.setProperty("color", "white", "important");
        tooltip.style.setProperty("border", "none", "important");
      }
    }

    // Update existing price elements with new appearance
    updateExistingPriceElements() {
      document
        .querySelectorAll(
          ".cc-style-underline, .cc-style-border, .cc-style-background"
        )
        .forEach((element) => {
          this.applyAppearanceToElement(element);
        });

      // Update tooltips
      document.querySelectorAll(".currency-tooltip").forEach((tooltip) => {
        this.applyTooltipTheme(tooltip);
      });

      console.log("Updated existing price elements with new appearance");
    }

    // Convert hex color to rgba
    hexToRgba(hex, alpha = 1) {
      console.log("hexToRgba called with:", hex, "alpha:", alpha);
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) {
        console.error("Failed to parse hex color:", hex);
        return `rgba(0, 123, 255, ${alpha})`;
      }

      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);

      const rgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      console.log("Converted", hex, "to", rgba);
      return rgba;
    }

    // Show error warning when sync fails
    showErrorWarning() {
      // Remove existing warning if present
      this.hideErrorWarning();

      const warning = document.createElement("div");
      warning.id = "currency-converter-error-warning";
      warning.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff4444;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 300px;
      animation: slideIn 0.3s ease-out;
    `;

      warning.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">Currency Converter</div>
      <div>Can't sync prices. Are you offline?</div>
    `;

      // Add slide-in animation
      const style = document.createElement("style");
      style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
      document.head.appendChild(style);

      document.body.appendChild(warning);

      // Auto-hide after 10 seconds
      setTimeout(() => {
        this.hideErrorWarning();
      }, 10000);
    }

    // Hide error warning
    hideErrorWarning() {
      const warning = document.getElementById(
        "currency-converter-error-warning"
      );
      if (warning) {
        warning.remove();
      }
    }
  }

  // Initialize the converter
  console.log("Content script loaded");

  const priceConverter = new PriceConverter();
} // End of if statement that checks for extension pages
