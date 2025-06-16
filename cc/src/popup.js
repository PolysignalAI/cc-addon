import {
  SUPPORTED_FIAT_CURRENCIES,
  SUPPORTED_CRYPTO_CURRENCIES,
  FIAT_CURRENCY_NAMES,
  CRYPTO_SYMBOL_TO_NAME,
  CURRENCY_SYMBOLS,
  DEBUG,
  debug,
} from "./constants.js";
import { MessageBus } from "./modules/core/MessageBus.js";
import { CurrencyDetector } from "./modules/detection/CurrencyDetector.js";

// Build currency definitions from constants
const CURRENCIES = {
  fiat: SUPPORTED_FIAT_CURRENCIES.map((code) => {
    const symbol = CURRENCY_SYMBOLS[code];
    const name = FIAT_CURRENCY_NAMES[code] || code;
    return {
      code,
      name: symbol ? `${name} (${symbol})` : name,
    };
  }),
  crypto: SUPPORTED_CRYPTO_CURRENCIES.map((code) => {
    const symbol = CURRENCY_SYMBOLS[code];
    const name = CRYPTO_SYMBOL_TO_NAME[code] || code;
    return {
      code,
      name: symbol ? `${name} (${symbol})` : name,
    };
  }),
};

class PopupManager {
  constructor() {
    this.currentTab = "all";
    this.currentView = "main";
    this.currentSettingsTab = "general";
    this.selectedCurrencies = new Set(["USD", "EUR", "GBP", "BTC"]);
    this.favoriteCurrencies = new Set(["USD", "EUR", "GBP", "BTC", "ETH"]);
    this.disabledUrls = [];
    this.baseCurrency = "USD";
    this.debounceTimer = null;
    this.currencyDetector = new CurrencyDetector();
    this.filterText = "";
    this.extensionEnabled = true;
    this.btcDenomination = "btc";
    this.exchangeRates = {};
    this.messageBus = new MessageBus();

    // Appearance settings
    this.appearance = {
      highlightStyle: "underline",
      borderColor: "#007bff",
      borderHoverColor: "#218838",
      backgroundColor: "#007bff",
      backgroundHoverColor: "#218838",
      borderThickness: 1,
      borderRadius: 2,
      borderStyle: "solid",
      backgroundOpacity: 10,
      tooltipTheme: "dark",
      paddingVertical: 1,
      paddingHorizontal: 4,
      tooltipFontSize: 13,
    };

    // Theme
    this.theme = "dark";

    // Converter state
    this.selectedTopCurrency = "USD";
    this.selectedBottomCurrency = "BTC";
    this.converterExpanded = false;

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.initializeConverter();
    this.renderCurrencyList();
    this.updateBaseDisplay();
    this.updateAppearancePreview();
    this.updateBorderColorVisibility();
    this.autoDetectCurrencyOnFirstRun();

    // Update last updated time with retry mechanism
    this.updateLastUpdated().catch(() => {
      // If initial update fails, retry after a short delay
      setTimeout(() => {
        this.updateLastUpdated();
      }, 500);
    });

    // Set up periodic refresh every 30 seconds
    setInterval(() => {
      this.updateLastUpdated();
    }, 30000);
  }

  loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        [
          "selectedCurrencies",
          "baseCurrency",
          "favoriteCurrencies",
          "disabledUrls",
          "currencyAutoDetected",
          "appearance",
          "extensionEnabled",
          "btcDenomination",
          "theme",
        ],
        (result) => {
          if (result.selectedCurrencies) {
            this.selectedCurrencies = new Set(result.selectedCurrencies);
          }
          if (result.favoriteCurrencies) {
            this.favoriteCurrencies = new Set(result.favoriteCurrencies);
          }
          if (result.disabledUrls) {
            this.disabledUrls = result.disabledUrls;
          }
          if (result.baseCurrency) {
            this.baseCurrency = result.baseCurrency;
            const baseSelect = document.getElementById("base-currency");
            if (baseSelect) {
              baseSelect.value = result.baseCurrency;
            }
          }
          if (result.appearance) {
            this.appearance = { ...this.appearance, ...result.appearance };
          }

          // Load extension enabled state
          if (result.extensionEnabled !== undefined) {
            this.extensionEnabled = result.extensionEnabled;
          }

          // Load BTC denomination preference
          this.btcDenomination = result.btcDenomination || "btc";
          const btcRadio = document.getElementById(
            `btc-denomination-${this.btcDenomination}`
          );
          if (btcRadio) {
            btcRadio.checked = true;
          }

          // Update toggle switches
          this.updateToggleSwitches();

          // Show detection status if currency was auto-detected
          if (result.currencyAutoDetected) {
            const statusElement = document.getElementById("detection-status");
            if (statusElement) {
              statusElement.textContent = `Auto-detected: ${this.baseCurrency}`;
              statusElement.className = "detected";
            }
          }

          // Load theme preference
          if (result.theme) {
            this.theme = result.theme;
          }
          this.applyTheme();

          this.loadAppearanceSettings();
          this.renderDisabledUrlsList();
          resolve();
        }
      );
    });
  }

  setupEventListeners() {
    // View navigation
    document.getElementById("open-settings").addEventListener("click", () => {
      this.showSettingsView();
    });

    document.getElementById("back-to-main").addEventListener("click", () => {
      this.showMainView();
    });

    document
      .getElementById("base-currency-link")
      .addEventListener("click", () => {
        this.showSettingsView();
      });

    // Theme toggle
    document.getElementById("theme-toggle").addEventListener("click", () => {
      this.toggleTheme();
    });

    // Converter toggle
    document
      .getElementById("converter-toggle")
      .addEventListener("click", () => {
        this.toggleConverter();
      });

    // Tab switching
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", (e) => {
        document
          .querySelectorAll(".tab-button")
          .forEach((btn) => btn.classList.remove("active"));
        e.target.classList.add("active");
        this.currentTab = e.target.dataset.tab;
        this.filterText = ""; // Clear filter when switching tabs
        this.renderCurrencyList();
      });
    });

    // Settings tab switching
    document.querySelectorAll(".settings-tab-button").forEach((button) => {
      button.addEventListener("click", (e) => {
        document
          .querySelectorAll(".settings-tab-button")
          .forEach((btn) => btn.classList.remove("active"));
        e.target.classList.add("active");
        this.currentSettingsTab = e.target.dataset.settingsTab;
        this.showSettingsTab(this.currentSettingsTab);
      });
    });

    // Settings changes
    document.getElementById("base-currency").addEventListener("change", (e) => {
      this.baseCurrency = e.target.value;
      this.updateBaseDisplay();
      this.renderCurrencyItems(); // Re-render to update prices
      this.debouncedSave();
    });

    // Currency detection
    document
      .getElementById("detect-currency")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.detectAndSetCurrency();
      });

    // Remove active class when clicking anywhere else
    document.addEventListener("click", (e) => {
      const detectBtn = document.getElementById("detect-currency");
      if (detectBtn && !detectBtn.contains(e.target)) {
        detectBtn.classList.remove("active");
      }
    });

    // Disabled URLs
    document
      .getElementById("add-disabled-url")
      .addEventListener("click", () => {
        this.addDisabledUrl();
      });

    document
      .getElementById("disabled-url-input")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.addDisabledUrl();
        }
      });

    // Extension toggle switches
    document
      .getElementById("extension-enabled-main")
      .addEventListener("change", (e) => {
        this.extensionEnabled = e.target.checked;
        this.syncToggleSwitches();
        this.debouncedSave();
      });

    document
      .getElementById("extension-enabled-settings")
      .addEventListener("change", (e) => {
        this.extensionEnabled = e.target.checked;
        this.syncToggleSwitches();
        this.debouncedSave();
      });

    // BTC denomination radio buttons
    document
      .querySelectorAll('input[name="btc-denomination"]')
      .forEach((radio) => {
        radio.addEventListener("change", (e) => {
          this.btcDenomination = e.target.value;
          this.debouncedSave();
        });
      });

    // Appearance settings
    this.setupAppearanceListeners();

    // Converter event listeners
    this.setupConverterListeners();
  }

  setupAppearanceListeners() {
    // Highlight style
    document
      .querySelectorAll('input[name="highlight-style"]')
      .forEach((radio) => {
        radio.addEventListener("change", (e) => {
          this.appearance.highlightStyle = e.target.value;
          this.updateBorderColorVisibility();
          this.updateAppearancePreview();
          this.debouncedSave();
        });
      });

    // Color preset buttons
    document.querySelectorAll(".color-preset").forEach((button) => {
      button.addEventListener("click", (e) => {
        const color = button.dataset.color;
        const type = button.dataset.type;

        // Update the appearance object based on type
        if (type === "border") {
          this.appearance.borderColor = color;
        } else if (type === "border-hover") {
          this.appearance.borderHoverColor = color;
        } else if (type === "background") {
          this.appearance.backgroundColor = color;
        } else if (type === "background-hover") {
          this.appearance.backgroundHoverColor = color;
        }

        // Update active state for buttons of the same type
        document
          .querySelectorAll(`.color-preset[data-type="${type}"]`)
          .forEach((btn) => {
            btn.classList.remove("active");
          });
        button.classList.add("active");

        this.updateAppearancePreview();
        this.debouncedSave();
      });
    });

    // Sliders
    document
      .getElementById("border-thickness")
      .addEventListener("input", (e) => {
        this.appearance.borderThickness = parseInt(e.target.value);
        document.querySelector(
          "#border-thickness + .slider-value"
        ).textContent = `${e.target.value}px`;
        this.updateAppearancePreview();
        this.debouncedSave();
      });

    document.getElementById("border-radius").addEventListener("input", (e) => {
      this.appearance.borderRadius = parseInt(e.target.value);
      document.querySelector("#border-radius + .slider-value").textContent =
        `${e.target.value}px`;
      this.updateAppearancePreview();
      this.debouncedSave();
    });

    document
      .getElementById("background-opacity")
      .addEventListener("input", (e) => {
        this.appearance.backgroundOpacity = parseInt(e.target.value);
        document.querySelector(
          "#background-opacity + .slider-value"
        ).textContent = `${e.target.value}%`;
        this.updateAppearancePreview();
        this.debouncedSave();
      });

    // Padding controls
    document
      .getElementById("padding-vertical")
      .addEventListener("input", (e) => {
        this.appearance.paddingVertical = parseInt(e.target.value);
        document.querySelector(
          "#padding-vertical + .slider-value"
        ).textContent = `${e.target.value}px`;
        this.updateAppearancePreview();
        this.debouncedSave();
      });

    document
      .getElementById("padding-horizontal")
      .addEventListener("input", (e) => {
        this.appearance.paddingHorizontal = parseInt(e.target.value);
        document.querySelector(
          "#padding-horizontal + .slider-value"
        ).textContent = `${e.target.value}px`;
        this.updateAppearancePreview();
        this.debouncedSave();
      });

    // Select controls
    document.getElementById("border-style").addEventListener("change", (e) => {
      this.appearance.borderStyle = e.target.value;
      this.updateAppearancePreview();
      this.debouncedSave();
    });

    document.getElementById("tooltip-theme").addEventListener("change", (e) => {
      this.appearance.tooltipTheme = e.target.value;
      this.updateAppearancePreview();
      this.debouncedSave();
    });

    // Tooltip font size
    document
      .getElementById("tooltip-font-size")
      .addEventListener("input", (e) => {
        this.appearance.tooltipFontSize = parseInt(e.target.value);
        document.querySelector(
          "#tooltip-font-size + .slider-value"
        ).textContent = `${e.target.value}px`;
        this.updateAppearancePreview();
        this.debouncedSave();
      });

    // Reset button
    document
      .getElementById("reset-appearance")
      .addEventListener("click", () => {
        this.resetAppearance();
      });
  }

  showMainView() {
    document.getElementById("main-view").classList.remove("hidden");
    document.getElementById("settings-view").classList.add("hidden");
    this.currentView = "main";
  }

  showSettingsView() {
    document.getElementById("settings-view").classList.remove("hidden");
    document.getElementById("main-view").classList.add("hidden");
    this.currentView = "settings";
    this.showSettingsTab(this.currentSettingsTab);
  }

  showSettingsTab(tabName) {
    // Hide all settings tabs
    document.querySelectorAll(".settings-tab-content").forEach((tab) => {
      tab.classList.add("hidden");
    });

    // Show the selected tab
    const targetTab = document.getElementById(`${tabName}-settings`);
    if (targetTab) {
      targetTab.classList.remove("hidden");
    }
  }

  updateBaseDisplay() {
    const baseLink = document.getElementById("base-currency-link");
    if (baseLink) {
      baseLink.textContent = this.baseCurrency;
    }
  }

  updateToggleSwitches() {
    const mainToggle = document.getElementById("extension-enabled-main");
    const settingsToggle = document.getElementById(
      "extension-enabled-settings"
    );

    if (mainToggle) {
      mainToggle.checked = this.extensionEnabled;
    }
    if (settingsToggle) {
      settingsToggle.checked = this.extensionEnabled;
    }
  }

  syncToggleSwitches() {
    // Keep both toggle switches in sync
    const mainToggle = document.getElementById("extension-enabled-main");
    const settingsToggle = document.getElementById(
      "extension-enabled-settings"
    );

    if (mainToggle) {
      mainToggle.checked = this.extensionEnabled;
    }
    if (settingsToggle) {
      settingsToggle.checked = this.extensionEnabled;
    }
  }

  renderCurrencyList() {
    const container = document.getElementById("currency-list");
    container.innerHTML = "";

    // Create filter input
    this.createFilterInput(container);

    // Create container for currency items
    const itemsContainer = document.createElement("div");
    itemsContainer.id = "currency-items";
    container.appendChild(itemsContainer);

    // Render the items
    this.renderCurrencyItems();
  }

  renderCurrencyItems() {
    const itemsContainer = document.getElementById("currency-items");
    if (!itemsContainer) return;

    itemsContainer.innerHTML = "";

    let currencies = [];
    if (this.currentTab === "all") {
      currencies = [...CURRENCIES.fiat, ...CURRENCIES.crypto];
    } else {
      currencies = CURRENCIES[this.currentTab];
    }

    // Apply filter if there's filter text
    if (this.filterText) {
      const filterLower = this.filterText.toLowerCase();
      currencies = currencies.filter(
        (currency) =>
          currency.name.toLowerCase().includes(filterLower) ||
          currency.code.toLowerCase().includes(filterLower)
      );
    }

    // Sort currencies: favorites first (alphabetically by code), then non-favorites (alphabetically by code)
    currencies.sort((a, b) => {
      const aIsFavorite = this.favoriteCurrencies.has(a.code);
      const bIsFavorite = this.favoriteCurrencies.has(b.code);

      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;

      // Both are favorites or both are not favorites, sort alphabetically by currency code
      return a.code.localeCompare(b.code);
    });

    currencies.forEach((currency) => {
      const item = document.createElement("div");
      item.className = "currency-item";

      // Create favorite star icon
      const starIcon = document.createElement("button");
      starIcon.type = "button";
      starIcon.className = `favorite-star ${
        this.favoriteCurrencies.has(currency.code) ? "favorited" : ""
      }`;
      starIcon.innerHTML = "★";
      starIcon.title = this.favoriteCurrencies.has(currency.code)
        ? "Remove from favorites"
        : "Add to favorites";
      starIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleFavorite(currency.code);
      });

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = currency.code;
      checkbox.checked = this.selectedCurrencies.has(currency.code);

      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          this.selectedCurrencies.add(currency.code);
        } else {
          this.selectedCurrencies.delete(currency.code);
        }
        this.debouncedSave();
      });

      const label = document.createElement("label");
      label.htmlFor = currency.code;

      // Calculate price for this currency
      let priceHTML = "";
      if (this.exchangeRates && Object.keys(this.exchangeRates).length > 0) {
        // Special case for BTC_SATS - use BTC rate
        const currencyForRate =
          currency.code === "BTC_SATS" ? "BTC" : currency.code;
        const rate = this.exchangeRates[currencyForRate];

        if (rate) {
          // For both fiat and crypto, show how much 1 unit of the currency costs in base currency
          const baseRate =
            this.baseCurrency === "USD"
              ? 1
              : this.exchangeRates[this.baseCurrency] || 1;

          // Calculate: 1 unit of displayed currency = X units of base currency
          // rate is USD->currency, baseRate is USD->baseCurrency
          // So 1 unit of currency = (1/rate) USD = (1/rate) * baseRate baseCurrency
          const priceInBaseCurrency = baseRate / rate;

          // Always format to 2 decimal places since base currency is always fiat
          const formattedPrice = priceInBaseCurrency.toFixed(2);

          // Add comma separators for thousands
          const parts = formattedPrice.split(".");
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          const formattedWithCommas = parts.join(".");

          // Get the currency symbol from constants
          const symbol =
            CURRENCY_SYMBOLS[this.baseCurrency] || this.baseCurrency + " ";
          priceHTML = `<span class="currency-price">${symbol}${formattedWithCommas}</span>`;
        }
      }

      label.innerHTML = `
                <span class="currency-code">${currency.code}${priceHTML}</span>
                <span class="currency-name">${currency.name}</span>
            `;

      item.appendChild(starIcon);
      item.appendChild(checkbox);
      item.appendChild(label);
      itemsContainer.appendChild(item);
    });
  }

  createFilterInput(container) {
    const filterContainer = document.createElement("div");
    filterContainer.className = "filter-container";

    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.id = "currency-filter";
    filterInput.className = "filter-input";
    filterInput.placeholder = "Filter currencies...";
    filterInput.value = this.filterText;

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "filter-clear";
    clearButton.innerHTML = "×";
    clearButton.title = "Clear filter";

    // Show/hide clear button based on filter text
    clearButton.style.display = this.filterText ? "block" : "none";

    // Add event listeners
    filterInput.addEventListener("input", (e) => {
      this.filterText = e.target.value;
      clearButton.style.display = this.filterText ? "block" : "none";
      this.renderCurrencyItems();
    });

    clearButton.addEventListener("click", () => {
      this.filterText = "";
      filterInput.value = "";
      clearButton.style.display = "none";
      this.renderCurrencyItems();
      filterInput.focus();
    });

    filterContainer.appendChild(filterInput);
    filterContainer.appendChild(clearButton);
    container.appendChild(filterContainer);
  }

  loadAppearanceSettings() {
    // Load saved appearance settings into UI
    document.getElementById(`style-${this.appearance.highlightStyle}`).checked =
      true;

    // Set active color preset buttons
    document.querySelectorAll(".color-preset").forEach((button) => {
      const color = button.dataset.color;
      const type = button.dataset.type;

      if (
        (type === "border" && color === this.appearance.borderColor) ||
        (type === "border-hover" &&
          color === this.appearance.borderHoverColor) ||
        (type === "background" && color === this.appearance.backgroundColor) ||
        (type === "background-hover" &&
          color === this.appearance.backgroundHoverColor)
      ) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    document.getElementById("border-thickness").value =
      this.appearance.borderThickness;
    document.getElementById("border-radius").value =
      this.appearance.borderRadius || 0;
    document.getElementById("background-opacity").value =
      this.appearance.backgroundOpacity;
    document.getElementById("padding-vertical").value =
      this.appearance.paddingVertical || 2;
    document.getElementById("padding-horizontal").value =
      this.appearance.paddingHorizontal || 4;
    document.getElementById("border-style").value = this.appearance.borderStyle;
    document.getElementById("tooltip-theme").value =
      this.appearance.tooltipTheme;
    document.getElementById("tooltip-font-size").value =
      this.appearance.tooltipFontSize || 13;

    // Update slider value displays
    document.querySelector("#border-thickness + .slider-value").textContent =
      `${this.appearance.borderThickness}px`;
    document.querySelector("#border-radius + .slider-value").textContent = `${
      this.appearance.borderRadius || 0
    }px`;
    document.querySelector("#background-opacity + .slider-value").textContent =
      `${this.appearance.backgroundOpacity}%`;
    document.querySelector("#padding-vertical + .slider-value").textContent =
      `${this.appearance.paddingVertical || 2}px`;
    document.querySelector("#padding-horizontal + .slider-value").textContent =
      `${this.appearance.paddingHorizontal || 4}px`;
    document.querySelector("#tooltip-font-size + .slider-value").textContent =
      `${this.appearance.tooltipFontSize || 13}px`;
  }

  updateAppearancePreview() {
    const preview = document.getElementById("price-preview");
    const tooltip = document.getElementById("tooltip-preview");

    if (!preview) return;

    // Reset classes and remove any inline styles
    preview.className = "price-preview";
    preview.removeAttribute("style"); // Clear any inline styles

    // Apply style
    preview.classList.add(`style-${this.appearance.highlightStyle}`);

    // Force immediate style recalculation
    preview.offsetHeight; // Trigger reflow

    // Apply CSS custom properties
    const root = document.documentElement;

    // Set properties both with and without cc- prefix for compatibility
    // Without prefix for popup.css
    root.style.setProperty("--border-color", this.appearance.borderColor);
    root.style.setProperty(
      "--border-hover-color",
      this.appearance.borderHoverColor
    );
    root.style.setProperty(
      "--background-color",
      this.appearance.backgroundColor
    );
    root.style.setProperty(
      "--background-hover-color",
      this.appearance.backgroundHoverColor
    );
    root.style.setProperty(
      "--border-thickness",
      `${this.appearance.borderThickness}px`
    );

    debug.log("Current appearance settings:", {
      borderThickness: this.appearance.borderThickness,
      borderThicknessType: typeof this.appearance.borderThickness,
      cssVarValue: `${this.appearance.borderThickness}px`,
      highlightStyle: this.appearance.highlightStyle,
    });

    // Check computed styles after a short delay
    setTimeout(() => {
      const computedStyles = window.getComputedStyle(preview);
      debug.log("Preview element computed border styles:", {
        borderBottom: computedStyles.borderBottom,
        border: computedStyles.border,
        borderBottomWidth: computedStyles.borderBottomWidth,
        borderWidth: computedStyles.borderWidth,
        outline: computedStyles.outline,
        boxShadow: computedStyles.boxShadow,
      });
    }, 100);
    root.style.setProperty(
      "--border-radius",
      `${this.appearance.borderRadius || 0}px`
    );
    root.style.setProperty("--border-style", this.appearance.borderStyle);
    root.style.setProperty(
      "--padding-vertical",
      `${this.appearance.paddingVertical || 2}px`
    );
    root.style.setProperty(
      "--padding-horizontal",
      `${this.appearance.paddingHorizontal || 4}px`
    );

    // Calculate background colors with opacity
    const bgRgb = this.hexToRgb(this.appearance.backgroundColor);
    const bgHoverRgb = this.hexToRgb(this.appearance.backgroundHoverColor);
    const opacity = this.appearance.backgroundOpacity / 100;

    // Check if color conversion worked
    if (!bgRgb || !bgHoverRgb) {
      debug.error("Failed to convert colors:", {
        backgroundColor: this.appearance.backgroundColor,
        backgroundHoverColor: this.appearance.backgroundHoverColor,
        bgRgb,
        bgHoverRgb,
      });
      return;
    }

    const bgColorRgba = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${opacity})`;
    const bgHoverColorRgba = `rgba(${bgHoverRgb.r}, ${bgHoverRgb.g}, ${bgHoverRgb.b}, ${opacity})`;

    root.style.setProperty("--background-color-rgba", bgColorRgba);
    root.style.setProperty("--background-hover-color-rgba", bgHoverColorRgba);

    // With cc- prefix for content.css (if preview element uses same classes)
    root.style.setProperty("--cc-border-color", this.appearance.borderColor);
    root.style.setProperty(
      "--cc-border-hover-color",
      this.appearance.borderHoverColor
    );
    root.style.setProperty(
      "--cc-background-color",
      this.appearance.backgroundColor
    );
    root.style.setProperty(
      "--cc-background-hover-color",
      this.appearance.backgroundHoverColor
    );
    root.style.setProperty(
      "--cc-border-thickness",
      `${this.appearance.borderThickness}px`
    );
    root.style.setProperty(
      "--cc-border-radius",
      `${this.appearance.borderRadius || 0}px`
    );
    root.style.setProperty("--cc-border-style", this.appearance.borderStyle);
    root.style.setProperty(
      "--cc-padding-vertical",
      `${this.appearance.paddingVertical || 2}px`
    );
    root.style.setProperty(
      "--cc-padding-horizontal",
      `${this.appearance.paddingHorizontal || 4}px`
    );
    root.style.setProperty("--cc-background-color-rgba", bgColorRgba);
    root.style.setProperty(
      "--cc-background-hover-color-rgba",
      bgHoverColorRgba
    );

    // Update tooltip theme
    if (tooltip) {
      if (this.appearance.tooltipTheme === "light") {
        tooltip.style.background = "rgba(255, 255, 255, 1)";
        tooltip.style.color = "#333";
        tooltip.style.border = "1px solid #ccc";
        tooltip.classList.remove("dark-theme");
        tooltip.classList.add("light-theme");
      } else {
        // Default to dark
        tooltip.style.background = "rgba(0, 0, 0, 1)";
        tooltip.style.color = "white";
        tooltip.style.border = "none";
        tooltip.classList.remove("light-theme");
        tooltip.classList.add("dark-theme");
      }
    }

    // Send appearance updates to content scripts
    this.broadcastAppearanceUpdate();
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  updateBorderColorVisibility() {
    const borderColorRow = document.getElementById("border-color-row");
    const borderHoverColorRow = document.getElementById(
      "border-hover-color-row"
    );

    if (this.appearance.highlightStyle === "background") {
      // Disable border color sections when background style is selected
      borderColorRow?.classList.add("disabled");
      borderHoverColorRow?.classList.add("disabled");
    } else {
      // Enable border color sections for underline and border styles
      borderColorRow?.classList.remove("disabled");
      borderHoverColorRow?.classList.remove("disabled");
    }
  }

  resetAppearance() {
    this.appearance = {
      highlightStyle: "underline",
      borderColor: "#007bff",
      borderHoverColor: "#218838",
      backgroundColor: "#007bff",
      backgroundHoverColor: "#218838",
      borderThickness: 1,
      borderRadius: 2,
      borderStyle: "solid",
      backgroundOpacity: 10,
      tooltipTheme: "dark",
      paddingVertical: 1,
      paddingHorizontal: 4,
      tooltipFontSize: 13,
    };

    this.loadAppearanceSettings();
    this.updateAppearancePreview();
    this.updateBorderColorVisibility();
    this.debouncedSave();
  }

  broadcastAppearanceUpdate() {
    // Send appearance settings only to active tab if it supports content scripts
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0]?.url) {
        // Check if we can inject content scripts on this page
        const url = tabs[0].url;
        const canInject =
          url &&
          !url.startsWith("chrome://") &&
          !url.startsWith("chrome-extension://") &&
          !url.startsWith("edge://") &&
          !url.startsWith("about:") &&
          !url.startsWith("file://") &&
          !url.includes("chrome.google.com/webstore");

        if (canInject) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "updateAppearance",
              appearance: this.appearance,
            },
            () => {
              // Ignore errors for tabs that don't have content script
              if (chrome.runtime.lastError) {
                // Silent fail
              }
            }
          );
        }
      }
    });
  }

  applyTheme() {
    document.body.setAttribute("data-theme", this.theme);
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      const svg = themeToggle.querySelector("svg");
      if (svg) {
        if (this.theme === "dark") {
          // Show sun icon when in dark mode
          svg.innerHTML =
            '<path d="M12 2V4M12 20V22M4 12H2M6.31412 6.31412L4.8999 4.8999M17.6859 6.31412L19.1001 4.8999M6.31412 17.69L4.8999 19.1042M17.6859 17.69L19.1001 19.1042M22 12H20M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        } else {
          // Show moon icon when in light mode
          svg.innerHTML =
            '<path d="M22 15.8442C20.6866 16.4382 19.2286 16.7688 17.6935 16.7688C11.9153 16.7688 7.23116 12.0847 7.23116 6.30654C7.23116 4.77135 7.5618 3.3134 8.15577 2C4.52576 3.64163 2 7.2947 2 11.5377C2 17.3159 6.68414 22 12.4623 22C16.7053 22 20.3584 19.4742 22 15.8442Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        }
      }
    }
  }

  toggleTheme() {
    this.theme = this.theme === "light" ? "dark" : "light";
    this.applyTheme();
    this.debouncedSave();
  }

  toggleConverter() {
    this.converterExpanded = !this.converterExpanded;
    const widget = document.getElementById("converter-widget");
    const toggle = document.getElementById("converter-toggle");
    const actionText = toggle.querySelector(".converter-toggle-action");

    if (this.converterExpanded) {
      widget.style.display = "block";
      // Force reflow before adding expanded class for smooth animation
      widget.offsetHeight;
      widget.classList.add("expanded");
      toggle.classList.add("expanded");
      actionText.textContent = "Collapse";
    } else {
      widget.classList.remove("expanded");
      toggle.classList.remove("expanded");
      actionText.textContent = "Expand";
      // Wait for animation to finish before hiding
      setTimeout(() => {
        if (!this.converterExpanded) {
          widget.style.display = "none";
        }
      }, 300);
    }
  }

  autoDetectCurrencyOnFirstRun() {
    chrome.storage.sync.get(["currencyAutoDetected"], (result) => {
      if (!result.currencyAutoDetected) {
        this.detectAndSetCurrency(true);
        chrome.storage.sync.set({ currencyAutoDetected: true });
      }
    });
  }

  detectAndSetCurrency(isAutomatic = false) {
    const statusElement = document.getElementById("detection-status");
    const detectBtn = document.getElementById("detect-currency");

    // Add active class when clicked
    if (!isAutomatic) {
      detectBtn.classList.add("active");
    }

    try {
      const detectionInfo = this.currencyDetector.getDetectionInfo();
      const detectedCurrency = detectionInfo.detectedCurrency;

      if (detectedCurrency && detectedCurrency !== this.baseCurrency) {
        this.baseCurrency = detectedCurrency;
        document.getElementById("base-currency").value = detectedCurrency;
        this.updateBaseDisplay();

        statusElement.textContent = `Detected: ${detectedCurrency} (${detectionInfo.timezone})`;
        statusElement.className = "detected";

        detectBtn.style.background = "#28a745";
        detectBtn.style.color = "white";
        detectBtn.style.borderColor = "#28a745";
        detectBtn.textContent = "✓ Detected";
        detectBtn.classList.remove("active");

        setTimeout(() => {
          detectBtn.textContent = "Auto-detect";
          detectBtn.style.background = "";
          detectBtn.style.color = "";
          detectBtn.style.borderColor = "";
        }, 2000);

        this.debouncedSave();

        if (isAutomatic) {
        } else {
        }
      } else if (detectedCurrency === this.baseCurrency) {
        statusElement.textContent = `Already using detected currency: ${detectedCurrency}`;
        statusElement.className = "detected";
        detectBtn.classList.remove("active");
      } else {
        statusElement.textContent = "Could not detect currency from timezone";
        statusElement.className = "detect-error";
        detectBtn.classList.remove("active");
      }
    } catch (error) {
      debug.error("Currency detection error:", error);
      statusElement.textContent = "Detection failed - using default";
      statusElement.className = "detect-error";
      detectBtn.classList.remove("active");
    }

    setTimeout(() => {
      statusElement.textContent =
        "Click Auto-detect to set currency based on timezone";
      statusElement.className = "";
    }, 5000);
  }

  clearCache() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("ext_")) {
        localStorage.removeItem(key);
      }
    }
  }

  showSuccess(message) {
    this.showMessage(message, "detected");
  }

  showWarning(message) {
    this.showMessage(message, "detect-error");
  }

  showMessage(message, className) {
    const statusElement = document.getElementById("detection-status");
    if (!statusElement) return;

    const originalText = statusElement.textContent;
    const originalClass = statusElement.className;

    statusElement.textContent = message;
    statusElement.className = className;

    setTimeout(() => {
      statusElement.textContent = originalText;
      statusElement.className = originalClass;
    }, 3000);
  }

  addDisabledUrl() {
    const input = document.getElementById("disabled-url-input");
    const pattern = input.value.trim();

    if (!pattern) {
      return;
    }

    try {
      // Test if it's a valid regex
      new RegExp(pattern);

      // Check if pattern already exists
      if (this.disabledUrls.includes(pattern)) {
        alert("This URL pattern already exists.");
        return;
      }

      this.disabledUrls.push(pattern);
      input.value = "";
      this.renderDisabledUrlsList();
      this.debouncedSave();
    } catch (error) {
      alert("Invalid regular expression pattern.");
    }
  }

  removeDisabledUrl(pattern) {
    const index = this.disabledUrls.indexOf(pattern);
    if (index > -1) {
      this.disabledUrls.splice(index, 1);
      this.renderDisabledUrlsList();
      this.debouncedSave();
    }
  }

  renderDisabledUrlsList() {
    const container = document.getElementById("disabled-urls-list");
    if (!container) return;

    container.innerHTML = "";

    if (this.disabledUrls.length === 0) {
      const noUrls = document.createElement("div");
      noUrls.className = "no-disabled-urls";
      noUrls.textContent = "No disabled URLs configured";
      container.appendChild(noUrls);
      return;
    }

    this.disabledUrls.forEach((pattern) => {
      const item = document.createElement("div");
      item.className = "disabled-url-item";

      const patternSpan = document.createElement("span");
      patternSpan.className = "disabled-url-pattern";
      patternSpan.textContent = pattern;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-url-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        this.removeDisabledUrl(pattern);
      });

      item.appendChild(patternSpan);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });
  }

  debouncedSave() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.saveSettings();
    }, 300);
  }

  toggleFavorite(currencyCode) {
    if (this.favoriteCurrencies.has(currencyCode)) {
      this.favoriteCurrencies.delete(currencyCode);
    } else {
      this.favoriteCurrencies.add(currencyCode);
    }
    this.debouncedSave();
    this.renderCurrencyItems(); // Re-render to update sorting
  }

  async saveSettings() {
    const settings = {
      selectedCurrencies: Array.from(this.selectedCurrencies),
      favoriteCurrencies: Array.from(this.favoriteCurrencies),
      disabledUrls: this.disabledUrls,
      baseCurrency: this.baseCurrency,
      appearance: this.appearance,
      extensionEnabled: this.extensionEnabled,
      btcDenomination: this.btcDenomination || "btc",
      theme: this.theme,
    };

    // Save to chrome storage
    chrome.storage.sync.set(settings, () => {
      // Settings saved
    });

    // Try to send update to active tab, but don't fail if it doesn't work
    // (e.g., on chrome:// pages or other restricted pages)
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id && tabs[0]?.url) {
        // Check if we can inject content scripts on this page
        const url = tabs[0].url;
        const canInject =
          url &&
          !url.startsWith("chrome://") &&
          !url.startsWith("chrome-extension://") &&
          !url.startsWith("edge://") &&
          !url.startsWith("about:") &&
          !url.startsWith("file://") &&
          !url.includes("chrome.google.com/webstore");

        if (canInject) {
          try {
            await chrome.tabs.sendMessage(tabs[0].id, {
              action: "updateSettings",
              selectedCurrencies: Array.from(this.selectedCurrencies),
              favoriteCurrencies: Array.from(this.favoriteCurrencies),
              disabledUrls: this.disabledUrls,
              baseCurrency: this.baseCurrency,
              appearance: this.appearance,
              extensionEnabled: this.extensionEnabled,
              btcDenomination: this.btcDenomination || "btc",
            });
          } catch (error) {
            // Silently ignore - content script might not be loaded yet
            if (DEBUG) {
              debug.log(
                "Could not send settings to tab (this is normal for restricted pages):",
                error.message
              );
            }
          }
        }
      }
    });
  }

  convertCurrency(amount, fromCurrency, toCurrency) {
    if (!this.exchangeRates || fromCurrency === toCurrency) {
      return amount;
    }

    // Get rates from the stored rates object
    const fromRate =
      fromCurrency === "USD" ? 1 : this.exchangeRates[fromCurrency] || null;
    const toRate =
      toCurrency === "USD" ? 1 : this.exchangeRates[toCurrency] || null;

    if (fromRate === null || toRate === null) {
      return null;
    }

    // Convert through USD
    return amount * (toRate / fromRate);
  }

  async updateLastUpdated() {
    const lastUpdatedElement = document.getElementById("last-updated-text");

    try {
      // Get the last update time and rates from background
      let response;
      try {
        response = await chrome.runtime.sendMessage({ action: "getRates" });
      } catch (error) {
        debug.warn("Failed to connect to background script:", error);
        // Try to wake up the service worker and retry
        await new Promise((resolve) => setTimeout(resolve, 100));
        try {
          response = await chrome.runtime.sendMessage({ action: "getRates" });
        } catch (retryError) {
          debug.error("Service worker not available:", retryError);
          throw retryError;
        }
      }

      if (response) {
        // Store exchange rates - combine fiat and crypto rates
        if (response.fiat || response.crypto) {
          this.exchangeRates = {
            ...response.fiat,
            ...response.crypto,
          };
          // Re-render currency items to show prices
          this.renderCurrencyItems();
        }

        // Update timestamp
        if (response.lastUpdate) {
          const date = new Date(response.lastUpdate);
          const hours = date.getHours().toString().padStart(2, "0");
          const minutes = date.getMinutes().toString().padStart(2, "0");
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const tzAbbr = new Date()
            .toLocaleTimeString("en-US", { timeZoneName: "short" })
            .split(" ")
            .pop();

          const lastUpdatedText = `Last updated: ${hours}:${minutes} ${tzAbbr}`;
          if (lastUpdatedElement) {
            lastUpdatedElement.textContent = lastUpdatedText;
          }
        } else {
          // If no last update time, show loading and request immediate update
          if (lastUpdatedElement) {
            lastUpdatedElement.textContent = "Loading...";
          }
          // Request background to fetch rates immediately
          chrome.runtime.sendMessage({ action: "forceUpdate" }).catch((err) => {
            debug.warn("Failed to send forceUpdate:", err);
          });
          // Retry in 2 seconds
          setTimeout(() => this.updateLastUpdated(), 2000);
        }
      } else {
        // No response, show loading and retry
        if (
          lastUpdatedElement &&
          (lastUpdatedElement.textContent.includes("--:--") ||
            lastUpdatedElement.textContent.includes("Loading"))
        ) {
          lastUpdatedElement.textContent = "Loading...";
        }
        // Request background to fetch rates
        chrome.runtime.sendMessage({ action: "forceUpdate" }).catch((err) => {
          debug.warn("Failed to send forceUpdate:", err);
        });
        // Retry in 2 seconds
        setTimeout(() => this.updateLastUpdated(), 2000);
      }
    } catch (error) {
      debug.error("Failed to get last update time:", error);
      // Show loading state
      if (
        lastUpdatedElement &&
        lastUpdatedElement.textContent.includes("--:--")
      ) {
        lastUpdatedElement.textContent = "Loading...";
      }
      throw error; // Re-throw to trigger retry mechanism
    }
  }

  // Converter methods
  initializeConverter() {
    const topSelect = document.getElementById("converter-top-select");
    const bottomSelect = document.getElementById("converter-bottom-select");

    // Populate both dropdowns with all currencies
    const populateSelect = (select) => {
      // Add fiat currencies
      const fiatGroup = document.createElement("optgroup");
      fiatGroup.label = "Fiat Currencies";
      SUPPORTED_FIAT_CURRENCIES.forEach((code) => {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = `${FIAT_CURRENCY_NAMES[code] || code} (${
          CURRENCY_SYMBOLS[code] || code
        })`;
        fiatGroup.appendChild(option);
      });
      select.appendChild(fiatGroup);

      // Add crypto currencies
      const cryptoGroup = document.createElement("optgroup");
      cryptoGroup.label = "Cryptocurrencies";
      SUPPORTED_CRYPTO_CURRENCIES.forEach((code) => {
        if (code !== "BTC_SATS") {
          // Exclude BTC_SATS from converter
          const option = document.createElement("option");
          option.value = code;
          option.textContent = `${
            CRYPTO_SYMBOL_TO_NAME[code] || code
          } (${code})`;
          cryptoGroup.appendChild(option);
        }
      });
      select.appendChild(cryptoGroup);
    };

    populateSelect(topSelect);
    populateSelect(bottomSelect);

    // Set default values
    topSelect.value = this.selectedTopCurrency;
    bottomSelect.value = this.selectedBottomCurrency;
    this.updateConverterDisplay();
  }

  setupConverterListeners() {
    const topInput = document.getElementById("converter-top-input");
    const bottomInput = document.getElementById("converter-bottom-input");
    const topSelect = document.getElementById("converter-top-select");
    const bottomSelect = document.getElementById("converter-bottom-select");
    const swapBtn = document.getElementById("converter-swap");

    // Input listener with numeric filtering (only top input is editable)
    topInput.addEventListener("input", (e) => {
      // Allow only numbers and decimal point
      let value = e.target.value;
      value = value.replace(/[^0-9.]/g, "");

      // Prevent multiple decimal points
      const parts = value.split(".");
      if (parts.length > 2) {
        value = parts[0] + "." + parts.slice(1).join("");
      }

      e.target.value = value;
      this.convertCurrencyInWidget(value);
    });

    // Select listeners
    topSelect.addEventListener("change", (e) => {
      this.selectedTopCurrency = e.target.value;
      this.updateConverterDisplay();
      this.convertCurrencyInWidget(topInput.value);
    });

    bottomSelect.addEventListener("change", (e) => {
      this.selectedBottomCurrency = e.target.value;
      this.updateConverterDisplay();
      this.convertCurrencyInWidget(topInput.value);
    });

    // Swap button listener
    swapBtn.addEventListener("click", () => {
      // Swap the currencies
      const tempCurrency = this.selectedTopCurrency;
      this.selectedTopCurrency = this.selectedBottomCurrency;
      this.selectedBottomCurrency = tempCurrency;

      // Update the select dropdowns
      topSelect.value = this.selectedTopCurrency;
      bottomSelect.value = this.selectedBottomCurrency;

      // Update the display
      this.updateConverterDisplay();

      // Get the current bottom value and put it in top, then convert
      const currentBottomValue = bottomInput.textContent;
      if (currentBottomValue && currentBottomValue !== "0") {
        topInput.value = currentBottomValue;
        this.convertCurrencyInWidget(currentBottomValue);
      } else {
        // If no value, just clear both
        topInput.value = "";
        bottomInput.textContent = "0";
      }

      // Animate the button
      swapBtn.classList.toggle("flipped");
    });

    // Close dropdowns when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".converter-currency-select")) {
        topSelect.blur();
        bottomSelect.blur();
      }
    });
  }

  updateConverterDisplay() {
    const topName = document.getElementById("top-currency-name");
    const bottomName = document.getElementById("bottom-currency-name");
    const topSymbol = document.getElementById("converter-top-symbol");
    const bottomSymbol = document.getElementById("converter-bottom-symbol");

    // Helper function to get currency display info
    const getCurrencyInfo = (code) => {
      const isFiat = SUPPORTED_FIAT_CURRENCIES.includes(code);
      const name = isFiat
        ? FIAT_CURRENCY_NAMES[code] || code
        : CRYPTO_SYMBOL_TO_NAME[code] || code;
      const symbol = CURRENCY_SYMBOLS[code] || code;
      return { name, symbol, isFiat };
    };

    // Update top currency display
    const topInfo = getCurrencyInfo(this.selectedTopCurrency);
    topName.textContent = `${topInfo.name} (${topInfo.symbol})`;
    topSymbol.textContent = topInfo.symbol;

    // Update bottom currency display
    const bottomInfo = getCurrencyInfo(this.selectedBottomCurrency);
    bottomName.textContent = `${bottomInfo.name} (${bottomInfo.symbol})`;
    bottomSymbol.textContent = bottomInfo.symbol;

    // All symbols are now on the right, no need to adjust positioning
  }

  convertCurrencyInWidget(value) {
    const bottomInput = document.getElementById("converter-bottom-input");

    if (!value || isNaN(value) || !this.exchangeRates) {
      bottomInput.textContent = "0";
      return;
    }

    const amount = parseFloat(value);
    const result = this.convertCurrency(
      amount,
      this.selectedTopCurrency,
      this.selectedBottomCurrency
    );

    if (result !== null) {
      // Determine formatting based on whether bottom currency is fiat or crypto
      const isFiat = SUPPORTED_FIAT_CURRENCIES.includes(
        this.selectedBottomCurrency
      );
      if (isFiat) {
        bottomInput.textContent = result.toFixed(2);
      } else {
        // For crypto, use more decimals if the value is small
        bottomInput.textContent =
          result < 1 ? result.toFixed(8) : result.toFixed(4);
      }
    } else {
      bottomInput.textContent = "0";
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupManager();
});
