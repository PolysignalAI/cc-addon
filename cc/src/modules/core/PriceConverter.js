import { debug, EXTENSION_CLASSES } from "../../constants.js";
import { Settings } from "./Settings.js";
import { MessageHandler } from "./MessageHandler.js";
import { MessageBus } from "./MessageBus.js";
import { StateManager } from "./StateManager.js";
import { CurrencyDetector } from "../detection/CurrencyDetector.js";
import { PriceExtractor } from "../detection/PriceExtractor.js";
import { PatternMatcher } from "../detection/PatternMatcher.js";
import { CurrencyConverter } from "../conversion/CurrencyConverter.js";
import { TooltipManager } from "../ui/TooltipManager.js";
import { StyleManager } from "../ui/StyleManager.js";

/**
 * Main coordinator class - simplified from the original 2700+ line monolith
 * Now acts as a clean orchestrator for the modular components
 */
export class PriceConverter {
  constructor() {
    // Core modules
    this.settings = new Settings();
    this.messageHandler = new MessageHandler();
    this.messageBus = new MessageBus();

    // Detection modules
    this.currencyDetector = new CurrencyDetector();
    this.priceExtractor = new PriceExtractor();
    this.patternMatcher = new PatternMatcher();

    // Conversion module
    this.currencyConverter = new CurrencyConverter();

    // UI modules
    this.tooltipManager = new TooltipManager();
    this.styleManager = new StyleManager();

    // Inject dependencies
    this.tooltipManager.setDependencies(this.currencyConverter, this.settings);

    // State
    this.isActive = false;
    this.processedNodes = new WeakSet();
    this.isProcessing = false;
    this.stateUnsubscribe = null;
  }

  /**
   * Initialize the price converter
   */
  async init() {
    try {
      // Prevent multiple initializations
      if (this.isActive) {
        debug.log("Already initialized, skipping");
        return;
      }

      // Set up message handlers FIRST (before any async operations)
      // Only set up if not already set up
      if (!this.messageHandlersSetup) {
        this.setupMessageHandlers();
        this.messageHandlersSetup = true;
      }

      // Load settings
      const settings = await this.settings.load();

      // Check if enabled
      if (
        !settings.extensionEnabled ||
        this.settings.isUrlDisabled(window.location.href)
      ) {
        return;
      }

      // Initialize modules
      this.styleManager.init(settings.appearance);
      this.currencyConverter.setBaseCurrency(settings.baseCurrency);
      this.currencyConverter.setBtcDenomination(settings.btcDenomination);

      // Get exchange rates
      await this.updateExchangeRates();

      // Detect page currency
      this.currencyDetector.detectPageCurrency();

      // Start processing
      this.isActive = true;
      this.startProcessing();
    } catch (error) {
      debug.error("Initialization error:", error);
      this.messageHandler.reportError(error, { phase: "init" });
    }
  }

  /**
   * Set up message handlers
   */
  setupMessageHandlers() {
    // Use the new message bus for reliable communication
    this.messageBus.on("updateSettings", async (request) => {
      // Extract settings from request
      const { action, ...updates } = request;

      // Handle different types of updates
      await this.handleSettingsUpdate(updates);

      // Send acknowledgment
      return { success: true };
    });

    // Handle appearance updates
    this.messageBus.on("updateAppearance", (request) => {
      if (request.appearance) {
        this.styleManager.updateStyles(request.appearance);
        this.updateExistingElements();
      }
      return { success: true };
    });

    // Also keep the old message handler for backward compatibility
    this.messageHandler.on("updateSettings", async (request) => {
      const { action, ...updates } = request;
      await this.handleSettingsUpdate(updates);
    });

    this.messageHandler.on("updateAppearance", (request) => {
      if (request.appearance) {
        this.styleManager.updateStyles(request.appearance);
        this.updateExistingElements();
      }
    });

    // Handle rate updates from background
    this.messageHandler.on("ratesUpdated", (request) => {
      if (request.rates) {
        this.currencyConverter.setRates(request.rates);
        // Update all active tooltips with new rates
        if (this.isActive) {
          this.tooltipManager.updateAllTooltips();
        }
      }
    });
  }

  /**
   * Handle settings updates
   */
  async handleSettingsUpdate(updates) {
    debug.log("handleSettingsUpdate called with:", updates);

    if (!this.isActive && !updates.extensionEnabled) {
      return;
    }

    // Store previous values for comparison
    const previousSettings = {
      selectedCurrencies: [...(this.settings.get("selectedCurrencies") || [])],
      baseCurrency: this.settings.get("baseCurrency"),
      btcDenomination: this.settings.get("btcDenomination"),
      extensionEnabled: this.settings.get("extensionEnabled"),
    };

    debug.log("Previous settings:", previousSettings);

    // Update settings
    await this.settings.save(updates);

    debug.log(
      "After save, selectedCurrencies:",
      this.settings.get("selectedCurrencies")
    );

    // Apply immediate changes
    this.applySettingsChanges(updates, previousSettings);
  }

  /**
   * Apply settings changes
   */
  applySettingsChanges(updates, previousSettings) {
    // Handle appearance updates
    if (updates.appearance) {
      this.styleManager.updateStyles(updates.appearance);
    }

    // Handle currency converter updates
    if (updates.baseCurrency) {
      this.currencyConverter.setBaseCurrency(updates.baseCurrency);
    }

    if (updates.btcDenomination !== undefined) {
      this.currencyConverter.setBtcDenomination(updates.btcDenomination);
    }

    // Handle extension enable/disable
    if (
      updates.extensionEnabled !== undefined &&
      updates.extensionEnabled !== previousSettings.extensionEnabled
    ) {
      if (updates.extensionEnabled === false) {
        this.cleanup();
        return;
      } else if (updates.extensionEnabled === true) {
        this.init();
        return;
      }
    }

    // Handle URL disable changes
    if (updates.disabledUrls !== undefined) {
      const isNowDisabled = this.settings.isUrlDisabled(window.location.href);
      if (isNowDisabled && this.isActive) {
        this.cleanup();
        return;
      } else if (!isNowDisabled && !this.isActive) {
        this.init();
        return;
      }
    }

    // Handle currency changes - THIS IS THE KEY FIX
    const currencyChanged =
      updates.selectedCurrencies !== undefined ||
      updates.baseCurrency !== undefined ||
      updates.btcDenomination !== undefined;

    if (this.isActive && currencyChanged) {
      debug.log(
        "Currency changed, updating tooltips. Selected currencies:",
        this.settings.get("selectedCurrencies")
      );

      // Update all active tooltips immediately
      this.tooltipManager.updateAllTooltips();

      // If selected currencies changed, also check for new prices to detect
      if (updates.selectedCurrencies) {
        const newCurrencies = new Set(updates.selectedCurrencies);
        const oldCurrencies = new Set(previousSettings.selectedCurrencies);

        // Find newly added currencies
        const addedCurrencies = [...newCurrencies].filter(
          (c) => !oldCurrencies.has(c)
        );

        if (addedCurrencies.length > 0) {
          this.scanForNewCurrencies(addedCurrencies);
        }
      }
    }
  }

  /**
   * Update exchange rates
   */
  async updateExchangeRates() {
    try {
      const response = await this.messageHandler.requestExchangeRates();
      if (response && (response.fiat || response.crypto)) {
        // Merge fiat and crypto rates into a single object
        const mergedRates = {
          ...response.fiat,
          ...response.crypto,
        };
        this.currencyConverter.setRates(mergedRates);

        // Only save if rates have actually changed
        const currentRates = this.settings.get("exchangeRates");
        const ratesChanged =
          !currentRates ||
          Object.keys(mergedRates).length !==
            Object.keys(currentRates).length ||
          Object.keys(mergedRates).some(
            (key) => mergedRates[key] !== currentRates[key]
          );

        if (ratesChanged) {
          await this.settings.save({
            exchangeRates: mergedRates,
            lastUpdated: response.lastUpdate || Date.now(),
          });
        } else {
        }
      }
    } catch (error) {
      debug.error("Failed to update exchange rates:", error);
      // Use cached rates if available
      const cachedRates = this.settings.get("exchangeRates");
      if (cachedRates) {
        this.currencyConverter.setRates(cachedRates);
      }
    }
  }

  /**
   * Start processing the page
   */
  startProcessing() {
    if (!this.isActive) return;

    // Set up mutation observer
    this.setupObserver();

    // Initial scan
    this.scanPage();

    // No periodic cleanup needed - tooltip manager handles its own cleanup
  }

  /**
   * Set up mutation observer
   */
  setupObserver() {
    // Track mutation frequency for adaptive debouncing
    this.mutationDebounceTimer = null;
    this.lastMutationTime = null;
    this.lastMutationCount = 0;
    this.mutationFrequency = 0;

    const observer = new MutationObserver((mutations) => {
      if (this.isProcessing || !this.isActive) return;

      // Update mutation frequency
      this.updateMutationFrequency(mutations.length);

      // Check if mutations should be processed
      let shouldProcess = false;
      for (const mutation of mutations) {
        // Skip our own elements
        if (this.isOurElement(mutation.target)) continue;

        // Check added nodes
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (this.shouldProcessNode(node)) {
              shouldProcess = true;
              break;
            }
          }
        }

        // Check character data changes
        if (
          mutation.type === "characterData" &&
          !this.isOurElement(mutation.target.parentElement)
        ) {
          shouldProcess = true;
        }

        if (shouldProcess) break;
      }

      if (shouldProcess) {
        this.debouncedProcess();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    this.observer = observer;
  }

  /**
   * Update mutation frequency for adaptive debouncing
   */
  updateMutationFrequency(mutationCount) {
    const now = Date.now();
    if (this.lastMutationTime) {
      const timeDiff = now - this.lastMutationTime;
      this.mutationFrequency = mutationCount / (timeDiff / 1000); // mutations per second
    }
    this.lastMutationTime = now;
    this.lastMutationCount = mutationCount;
  }

  /**
   * Adaptive debouncing based on mutation frequency
   */
  debouncedProcess() {
    clearTimeout(this.mutationDebounceTimer);

    // Adaptive delay based on mutation frequency
    let delay = 250; // Default delay
    if (this.mutationFrequency > 10) {
      delay = 1000; // High frequency: longer delay
    } else if (this.mutationFrequency > 2) {
      delay = 250; // Medium frequency: default delay
    } else {
      delay = 50; // Low frequency: shorter delay
    }

    this.mutationDebounceTimer = setTimeout(() => {
      this.scanPage();
    }, delay);
  }

  /**
   * Handle DOM mutations
   */
  handleMutations(mutations) {
    let hasNewContent = false;

    for (const mutation of mutations) {
      // Skip our own elements
      if (this.isOurElement(mutation.target)) continue;

      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (this.shouldProcessNode(node)) {
            hasNewContent = true;
            break;
          }
        }
      } else if (mutation.type === "characterData") {
        if (this.shouldProcessNode(mutation.target)) {
          hasNewContent = true;
        }
      }
    }

    if (hasNewContent) {
      this.scanPage();
    }
  }

  /**
   * Check if element is created by our extension
   */
  isOurElement(element) {
    if (!element || !element.classList) return false;

    const ourClasses = Object.values(EXTENSION_CLASSES);

    // Also check for tooltip-related classes
    const tooltipClasses = [
      "currency-tooltip",
      "currency-tooltip-content",
      "currency-item",
      "currency-amount",
      "currency-code",
    ];
    const allOurClasses = [...ourClasses, ...tooltipClasses];

    return allOurClasses.some((className) =>
      element.classList.contains(className)
    );
  }

  /**
   * Check if node should be processed
   */
  shouldProcessNode(node) {
    if (!node) return false;

    // Skip if already processed
    if (this.processedNodes.has(node)) return false;

    // Check if it's a text node with content
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent && node.textContent.trim().length > 0;
    }

    // Check if element has text content
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node.textContent && node.textContent.trim().length > 0;
    }

    return false;
  }

  /**
   * Scan the page for prices
   */
  async scanPage() {
    if (this.isProcessing || !this.isActive) return;

    this.isProcessing = true;

    try {
      // First, process split prices (currency in one element, amount in another)
      await this.processSplitPrices();

      // Find all text nodes
      const textNodes = this.findTextNodes(document.body);

      // Process in chunks for performance
      await this.processNodesInChunks(textNodes);
    } catch (error) {
      debug.error("Scan error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Find all text nodes in element
   */
  findTextNodes(root) {
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip if already processed
        if (this.processedNodes.has(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip empty nodes
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip script and style elements
        const parent = node.parentElement;
        if (
          parent &&
          (parent.tagName === "SCRIPT" || parent.tagName === "STYLE")
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip our own elements
        if (parent && this.isOurElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip tooltip portal entirely
        if (parent && parent.closest("#currency-converter-portal")) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    return textNodes;
  }

  /**
   * Process nodes in chunks
   */
  async processNodesInChunks(nodes, chunkSize = 50) {
    for (let i = 0; i < nodes.length; i += chunkSize) {
      if (!this.isActive) break;

      const chunk = nodes.slice(i, i + chunkSize);

      // Process chunk
      for (const node of chunk) {
        this.processTextNode(node);
      }

      // Yield to browser
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * Process a text node for prices
   */
  processTextNode(node) {
    if (!node || !node.textContent) return;

    const text = node.textContent;
    const matches = this.patternMatcher.findPriceMatches(text);

    if (matches.length === 0) return;

    // Sort matches by position (reverse order to process from end to start)
    const sortedMatches = [...matches].sort((a, b) => b.index - a.index);

    // Process each match from end to start to avoid position shifts
    for (const match of sortedMatches) {
      const price = this.priceExtractor.extractPrice(match.text);
      if (!price || !this.priceExtractor.isValidPrice(price)) {
        continue;
      }

      const currency = this.currencyDetector.extractCurrency(match.text, node);
      if (!currency) {
        continue;
      }

      // Create price element
      try {
        this.createPriceElement(node, match, price, currency);
      } catch (error) {
        debug.error("Error creating price element:", error);
      }
    }

    // Mark as processed
    this.processedNodes.add(node);
  }

  /**
   * Create price element with tooltip
   */
  createPriceElement(textNode, match, price, currency) {
    try {
      // Calculate conversions
      const selectedCurrencies = this.settings.getSelectedCurrencies();

      const conversions = this.currencyConverter.calculateConversions(
        price,
        currency,
        selectedCurrencies
      );

      if (conversions.length === 0) {
        return;
      }

      // Create wrapper element
      const wrapper = document.createElement("span");
      wrapper.className = EXTENSION_CLASSES.wrapper;
      wrapper.dataset.currency = currency;
      wrapper.dataset.amount = price;

      // Apply appearance
      this.styleManager.applyToElement(wrapper);

      // Create tooltip
      const tooltip = this.tooltipManager.createTooltip(
        conversions,
        currency,
        price
      );

      // Store tooltip reference on wrapper for updates
      wrapper._tooltip = tooltip;

      // Set up hover handlers
      wrapper.addEventListener("mouseenter", () => {
        try {
          // Always get the latest tooltip (in case it was updated)
          let currentTooltip = wrapper._tooltip || tooltip;

          // Always recalculate conversions on hover to ensure fresh data
          const currentSelectedCurrencies =
            this.settings.getSelectedCurrencies();
          const updatedConversions =
            this.currencyConverter.calculateConversions(
              parseFloat(wrapper.dataset.amount),
              wrapper.dataset.currency,
              currentSelectedCurrencies
            );

          const newContent = this.tooltipManager.buildTooltipContent(
            updatedConversions,
            wrapper.dataset.currency,
            parseFloat(wrapper.dataset.amount)
          );

          currentTooltip.innerHTML = newContent;

          this.tooltipManager.show(wrapper, currentTooltip);
        } catch (error) {
          debug.error("Error in mouseenter handler:", error);
        }
      });

      wrapper.addEventListener("mouseleave", () => {
        try {
          const currentTooltip = wrapper._tooltip || tooltip;
          this.tooltipManager.hide(currentTooltip);
        } catch (error) {
          debug.error("Error in mouseleave handler:", error);
        }
      });

      // Replace text node with wrapper
      // Check if textNode still has a parent (might have been removed during processing)
      if (!textNode.parentNode) {
        return;
      }

      const beforeText = textNode.textContent.substring(0, match.index);
      const priceText = match.text;
      const afterText = textNode.textContent.substring(
        match.index + match.text.length
      );

      if (beforeText) {
        textNode.parentNode.insertBefore(
          document.createTextNode(beforeText),
          textNode
        );
      }

      wrapper.textContent = priceText;
      textNode.parentNode.insertBefore(wrapper, textNode);

      if (afterText) {
        textNode.parentNode.insertBefore(
          document.createTextNode(afterText),
          textNode
        );
      }

      textNode.parentNode.removeChild(textNode);

      // Track conversion
      this.messageHandler.trackConversion({
        from: currency,
        amount: price,
        conversions: conversions.length,
      });
    } catch (error) {
      debug.error("Error creating price element:", error);
    }
  }

  /**
   * Remove tooltips for specific currencies
   */
  removeCurrencyTooltips(currencies) {
    // Find all price wrappers
    const wrappers = document.querySelectorAll(`.${EXTENSION_CLASSES.wrapper}`);

    wrappers.forEach((wrapper) => {
      const currency = wrapper.dataset.currency;
      if (currencies.includes(currency)) {
        // Get the tooltip associated with this wrapper
        const tooltip = this.tooltipManager.getTooltipForElement(wrapper);
        if (tooltip) {
          this.tooltipManager.removeTooltip(tooltip);
        }

        // Unwrap the price text
        const text = wrapper.textContent;
        const textNode = document.createTextNode(text);
        wrapper.parentNode.replaceChild(textNode, wrapper);
      }
    });
  }

  /**
   * Scan for prices in newly added currencies
   */
  scanForNewCurrencies(currencies) {
    // For now, just do a regular scan since we process all currencies anyway
    // The pattern matcher will find all price patterns regardless
    debug.log("Scanning for new currencies:", currencies);
    this.scanPage();
  }

  /**
   * Rescan the page (full rescan - only use when necessary)
   */
  rescanPage() {
    // Cancel any pending debounced scans
    clearTimeout(this.mutationDebounceTimer);

    // Temporarily disconnect observer to prevent interference
    if (this.observer) {
      this.observer.disconnect();
    }

    // Clear processed nodes
    this.processedNodes = new WeakSet();

    // Remove all tooltips and clean up event listeners
    this.removeAllTooltips();

    // Log current selected currencies

    // Wait for DOM to settle before rescanning
    setTimeout(() => {
      // Scan again
      this.scanPage();

      // Reconnect observer
      if (this.observer) {
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }, 100); // Increased delay to ensure proper cleanup
  }

  /**
   * Remove all tooltips and price wrappers
   */
  removeAllTooltips() {
    // Hide all tooltips first
    this.tooltipManager.hideAll();

    // Clean up any orphaned tooltips
    const orphanedTooltips = document.querySelectorAll(".currency-tooltip");
    orphanedTooltips.forEach((tooltip) => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    });

    // Clean up the portal itself
    const portal = document.getElementById("currency-converter-portal");
    if (portal) {
      portal.remove();
      // Reset the tooltipManager's portal reference
      this.tooltipManager.tooltipPortal = null;
    }

    // Remove all price wrappers and restore original text
    const wrappers = document.querySelectorAll(".price-wrapper");

    wrappers.forEach((wrapper) => {
      // The wrapper itself has the style classes and event listeners
      // Clone it to remove event listeners
      const clonedWrapper = wrapper.cloneNode(true);

      // Get the text content
      const text = wrapper.textContent;

      // Replace wrapper with text node
      const textNode = document.createTextNode(text);
      if (wrapper.parentNode) {
        wrapper.parentNode.replaceChild(textNode, wrapper);
      }
    });
  }

  /**
   * Update existing elements
   */
  updateExistingElements() {
    const elements = document.querySelectorAll(".price-wrapper");

    for (const element of elements) {
      // Reapply appearance
      this.styleManager.applyToElement(element);
    }
  }

  /**
   * Full cleanup when extension is disabled or page unloads
   */
  cleanup() {
    this.isActive = false;

    // Stop observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clean up timers
    clearTimeout(this.mutationTimer);
    clearTimeout(this.mutationDebounceTimer);

    // Clean up state subscriptions
    if (this.stateUnsubscribe) {
      this.stateUnsubscribe();
      this.stateUnsubscribe = null;
    }

    // Remove all tooltips and wrappers
    this.removeAllTooltips();

    // Clean up message handlers
    this.messageHandler.cleanup();
    this.messageBus.cleanup();

    // Reset handler setup flag so they can be re-registered on next init
    this.messageHandlersSetup = false;

    // Clean up modules
    this.tooltipManager.cleanup();
    this.styleManager.cleanup();
    this.patternMatcher.clearCache();
    this.currencyDetector.clearCache();

    // Clear processed nodes - create new WeakSet to release references
    this.processedNodes = new WeakSet();
  }

  /**
   * Process split prices where currency symbol and amount are in separate elements
   */
  async processSplitPrices() {
    try {
      // Look for common split price patterns
      // Pattern 1: <span>$</span><span>99</span><span>99</span> (Amazon style)
      // Pattern 2: <span>AU$</span> <span>1,234.56</span>

      // Find all elements that might contain currency symbols
      const currencyElements = document.querySelectorAll("span, div, sup");

      for (const element of currencyElements) {
        // Skip if already processed
        if (element.classList.contains(EXTENSION_CLASSES.wrapper)) continue;
        if (this.processedNodes.has(element)) continue;

        const text = element.textContent.trim();

        // Check if this element contains only a currency symbol
        if (this.isCurrencySymbolOnly(text)) {
          // Look for adjacent price elements
          const priceData = this.findAdjacentPrice(element, text);

          if (priceData) {
            this.createSplitPriceElement(element, priceData);
          }
        }
      }
    } catch (error) {
      debug.error("Error processing split prices:", error);
    }
  }

  /**
   * Check if text contains only a currency symbol
   */
  isCurrencySymbolOnly(text) {
    // Check for multi-character symbols
    const multiCharSymbols = Object.keys(MULTI_CHAR_CURRENCY_SYMBOLS);
    for (const symbol of multiCharSymbols) {
      if (text === symbol) return true;
    }

    // Check for single character symbols
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

  /**
   * Find adjacent price elements
   */
  findAdjacentPrice(currencyElement, currencySymbol) {
    const parent = currencyElement.parentElement;
    if (!parent) return null;

    // Get all child elements
    const siblings = Array.from(parent.children);
    const currencyIndex = siblings.indexOf(currencyElement);

    // Look for price parts after the currency symbol
    let priceText = "";
    let priceElements = [];
    let hasDecimalPoint = false;

    for (let i = currencyIndex + 1; i < siblings.length; i++) {
      const sibling = siblings[i];

      // Handle Amazon-style nested elements (like a-price-whole with nested decimal)
      if (sibling.classList?.contains("a-price-whole")) {
        // Extract text from the whole price element, excluding the decimal point element
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
        continue;
      }

      // Handle Amazon fraction
      if (sibling.classList?.contains("a-price-fraction")) {
        if (!hasDecimalPoint && priceText && !priceText.includes(".")) {
          priceText += ".";
        }
        priceText += sibling.textContent.trim();
        priceElements.push(sibling);
        break; // Stop after fraction
      }

      const text = sibling.textContent.trim();

      // Check if this looks like a price part
      if (/^[\d,]+$/.test(text)) {
        // Special handling for superscript cents
        if (
          sibling.tagName === "SUP" &&
          text.length === 2 &&
          /^\d{2}$/.test(text)
        ) {
          // This is cents in superscript
          if (priceText && !priceText.includes(".")) {
            priceText = priceText + "." + text;
          } else {
            priceText += text;
          }
          priceElements.push(sibling);
          break; // Stop after superscript cents
        }
        // For cases where we have two adjacent number spans (like <span>99</span><span>99</span>)
        else if (
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
          priceText += text;
          priceElements.push(sibling);
        }
      } else if (
        text === "." ||
        sibling.classList?.contains("a-price-decimal")
      ) {
        priceText += ".";
        priceElements.push(sibling);
        hasDecimalPoint = true;
      } else {
        // Check if this could be a full price (like "1,234.56")
        if (/^[\d,]+(?:\.\d+)?$/.test(text)) {
          priceText = text;
          priceElements.push(sibling);
          break; // Found complete price
        }
        // For split prices with space, check if next element might be the price
        if (!priceText && i === currencyIndex + 1) {
          // Try next sibling
          continue;
        }
        break;
      }
    }

    if (priceText && /\d/.test(priceText)) {
      const price = this.priceExtractor.extractPrice(priceText);
      const currency = this.currencyDetector.extractCurrency(
        currencySymbol + priceText
      );

      if (price && this.priceExtractor.isValidPrice(price)) {
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

  /**
   * Extract text from element, excluding certain child classes
   */
  extractTextFromElement(element, excludeClasses = []) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Check if this element should be excluded
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

  /**
   * Create price element for split price display
   */
  createSplitPriceElement(currencyElement, priceData) {
    try {
      const { price, currency, priceElements, fullText } = priceData;

      // Calculate conversions
      const selectedCurrencies = this.settings.getSelectedCurrencies();
      const conversions = this.currencyConverter.calculateConversions(
        price,
        currency,
        selectedCurrencies
      );

      if (conversions.length === 0) return;

      // Create wrapper that will contain all elements
      const wrapper = document.createElement("span");
      wrapper.className = EXTENSION_CLASSES.wrapper;
      wrapper.dataset.currency = currency;
      wrapper.dataset.amount = price;

      // Apply appearance
      this.styleManager.applyToElement(wrapper);

      // Create tooltip
      const tooltip = this.tooltipManager.createTooltip(
        conversions,
        currency,
        price
      );

      wrapper._tooltip = tooltip;

      // Set up hover handlers
      wrapper.addEventListener("mouseenter", () => {
        try {
          const currentTooltip = wrapper._tooltip || tooltip;
          const currentSelectedCurrencies =
            this.settings.getSelectedCurrencies();
          const updatedConversions =
            this.currencyConverter.calculateConversions(
              parseFloat(wrapper.dataset.amount),
              wrapper.dataset.currency,
              currentSelectedCurrencies
            );

          const newContent = this.tooltipManager.buildTooltipContent(
            updatedConversions,
            wrapper.dataset.currency,
            parseFloat(wrapper.dataset.amount)
          );

          currentTooltip.innerHTML = newContent;
          this.tooltipManager.show(wrapper, currentTooltip);
        } catch (error) {
          debug.error("Error in mouseenter handler:", error);
        }
      });

      wrapper.addEventListener("mouseleave", () => {
        try {
          const currentTooltip = wrapper._tooltip || tooltip;
          this.tooltipManager.hide(currentTooltip);
        } catch (error) {
          debug.error("Error in mouseleave handler:", error);
        }
      });

      // Move all elements into the wrapper
      const parent = currencyElement.parentElement;
      parent.insertBefore(wrapper, currencyElement);

      // Move currency element and price elements into wrapper
      wrapper.appendChild(currencyElement);
      for (const elem of priceElements) {
        wrapper.appendChild(elem);
      }

      // Mark elements as processed
      this.processedNodes.add(currencyElement);
      priceElements.forEach((elem) => this.processedNodes.add(elem));

      // Track conversion
      this.messageHandler.trackConversion({
        from: currency,
        amount: price,
        conversions: conversions.length,
      });
    } catch (error) {
      debug.error("Error creating split price element:", error);
    }
  }
}
