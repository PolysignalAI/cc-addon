// Demo state
let demoState = {
  theme: document.documentElement.getAttribute("data-theme") || "light", // Match initial page theme
  tooltipTheme: "dark",
  highlightStyle: "underline",
  borderColor: "#007bff",
  borderHoverColor: "#218838",
  backgroundColor: "#007bff",
  backgroundHoverColor: "#218838",
  borderThickness: 2,
  borderRadius: 0,
  borderStyle: "solid",
  backgroundOpacity: 10,
  selectedCurrencies: ["AUD", "EUR", "BTC"],
  baseCurrency: "USD",
};

// Mock browser API globally
window.browser = window.chrome = {
  storage: {
    sync: {
      get: (keys, callback) => {
        callback({
          selectedCurrencies: demoState.selectedCurrencies,
          baseCurrency: demoState.baseCurrency,
          theme: demoState.theme,
          appearance: demoState,
          favoriteCurrencies: ["USD", "EUR"],
          btcDenomination: "btc",
          extensionEnabled: true,
        });
      },
      set: (data, callback) => {
        // Update demo state when settings change
        if (data.appearance) Object.assign(demoState, data.appearance);
        if (data.theme) demoState.theme = data.theme;
        if (data.selectedCurrencies)
          demoState.selectedCurrencies = data.selectedCurrencies;

        // Update price demo
        updatePriceStyles();
        updateTooltipCurrencies();

        if (callback) callback();
      },
    },
  },
  runtime: {
    sendMessage: () =>
      Promise.resolve({
        lastUpdate: Date.now(),
        fiat: {
          USD: 1,
          EUR: 0.925,
          GBP: 0.796,
          JPY: 149.85,
          CAD: 1.35,
          AUD: 1.52,
          CHF: 0.91,
          CNY: 7.24,
        },
        crypto: {
          BTC: 43250.0,
          ETH: 2315.0,
          BNB: 315.0,
          XRP: 0.62,
        },
      }),
    lastError: null,
  },
  tabs: {
    query: (opts, callback) => callback([]),
    sendMessage: () => {},
  },
};

// Wait for DOM to be ready
document.addEventListener("DOMContentLoaded", async function () {
  const iframe = document.getElementById("extension-demo-frame");

  // Load all necessary files
  const [cssResponse, detectorResponse, htmlResponse, jsResponse] =
    await Promise.all([
      fetch("addon/src/popup.css"),
      fetch("addon/src/currency-detector.js"),
      fetch("addon/src/popup.html"),
      fetch("addon/src/popup.js"),
    ]);

  const [css, detectorScript, html, popupScript] = await Promise.all([
    cssResponse.text(),
    detectorResponse.text(),
    htmlResponse.text(),
    jsResponse.text(),
  ]);

  // Extract body content from HTML and remove script tags
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let bodyContent = bodyMatch ? bodyMatch[1] : "";

  // Remove the script tags since we'll add them differently
  bodyContent = bodyContent.replace(
    /<script[^>]*src=["']currency-detector\.js["'][^>]*><\/script>/gi,
    ""
  );
  bodyContent = bodyContent.replace(
    /<script[^>]*src=["']popup\.js["'][^>]*><\/script>/gi,
    ""
  );

  // Also remove any empty script tags that might cause issues
  bodyContent = bodyContent.replace(/<script[^>]*><\/script>/gi, "");

  // Create the iframe content by building it piece by piece
  const iframeDoc = document.implementation.createHTMLDocument();

  // Add CSS
  const styleEl = iframeDoc.createElement("style");
  styleEl.textContent = css;
  iframeDoc.head.appendChild(styleEl);

  // Add additional scrollbar styling for the whole iframe document
  const scrollbarStyle = iframeDoc.createElement("style");
  scrollbarStyle.textContent = `
    /* General scrollbar styling for the entire document */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: #f1f3f4;
    }
    
    ::-webkit-scrollbar-thumb {
      background: #c1c8cd;
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #a8b2ba;
    }
    
    /* Dark theme scrollbar for the entire document */
    [data-theme="dark"]::-webkit-scrollbar-track,
    [data-theme="dark"] ::-webkit-scrollbar-track {
      background: #1a1a1a;
    }
    
    [data-theme="dark"]::-webkit-scrollbar-thumb,
    [data-theme="dark"] ::-webkit-scrollbar-thumb {
      background: #4a4a4a;
      border-radius: 4px;
    }
    
    [data-theme="dark"]::-webkit-scrollbar-thumb:hover,
    [data-theme="dark"] ::-webkit-scrollbar-thumb:hover {
      background: #5a5a5a;
    }
    
    /* Firefox scrollbar support */
    * {
      scrollbar-width: thin;
      scrollbar-color: #c1c8cd #f1f3f4;
    }
    
    [data-theme="dark"] * {
      scrollbar-color: #4a4a4a #1a1a1a;
    }
  `;
  iframeDoc.head.appendChild(scrollbarStyle);

  // Add body content
  iframeDoc.body.innerHTML = bodyContent;

  // Set initial theme on the iframe document
  iframeDoc.documentElement.setAttribute("data-theme", demoState.theme);

  // Add scripts
  const scriptEl = iframeDoc.createElement("script");
  scriptEl.textContent = `
          // Listen for theme updates from parent
          window.addEventListener('message', (event) => {
            if (event.data.type === 'updateTheme') {
              document.documentElement.setAttribute('data-theme', event.data.theme);
              // Update the stored theme without clicking the toggle
              if (window.chrome && window.chrome.storage && window.chrome.storage.sync) {
                window.chrome.storage.sync.set({ theme: event.data.theme });
              }
              // Update the popup instance if it exists
              if (window.popupInstance) {
                window.popupInstance.theme = event.data.theme;
                window.popupInstance.applyTheme();
              }
            }
          });

          // Mock browser APIs
          window.chrome = window.browser = {
            storage: {
              sync: {
                get: (keys, callback) => {
                  callback({
                    selectedCurrencies: ${JSON.stringify(
                      demoState.selectedCurrencies
                    )},
                    baseCurrency: "${demoState.baseCurrency}",
                    theme: "${demoState.theme}",
                    appearance: ${JSON.stringify(demoState)},
                    favoriteCurrencies: ["AUD", "EUR", "USD", "SGD", "SEK"],
                    btcDenomination: "btc",
                    extensionEnabled: true
                  });
                },
                set: (data, callback) => {
                  // Update parent demo state
                  window.parent.postMessage({
                    type: 'updateDemoState',
                    data: data
                  }, '*');
                  if (callback) callback();
                }
              }
            },
            runtime: {
              sendMessage: () => Promise.resolve({
                lastUpdate: Date.now(),
                fiat: {
                  USD: 1,
                  EUR: 0.925,
                  GBP: 0.796,
                  JPY: 149.85,
                  CAD: 1.35,
                  AUD: 1.52,
                  CHF: 0.91,
                  CNY: 7.24,
                  INR: 83.25,
                  KRW: 1318.50,
                  MXN: 17.85,
                  BRL: 4.98,
                  SGD: 1.35,
                  HKD: 7.83,
                  NZD: 1.64,
                  SEK: 10.48,
                  NOK: 10.65,
                  DKK: 6.89,
                  PLN: 4.01,
                  CZK: 22.45,
                  HUF: 354.20,
                  RON: 4.59,
                  BGN: 1.81,
                  IDR: 15632.0,
                  PHP: 56.25,
                  MYR: 4.48,
                  THB: 34.85,
                  TRY: 32.15,
                  ILS: 3.72,
                  ZAR: 18.45,
                  ISK: 137.50
                },
                crypto: {
                  BTC: 0.0000231,
                  BTC_SATS: 0.0000231,
                  ETH: 0.000432,
                  BNB: 0.00317,
                  XRP: 1.613,
                  SOL: 0.00445,
                  DOGE: 3.125,
                  TRX: 25.64,
                  ADA: 1.563,
                  BCH: 0.00198,
                  XLM: 2.632,
                  LTC: 0.00893,
                  DOT: 0.143,
                  XMR: 0.00485,
                  PEPE: 41666.67,
                  AAVE: 0.00625,
                  PI: 0.03125,
                  CRO: 10.526,
                  TRUMP: 0.0833,
                  VET: 31.25,
                  RENDER: 0.179,
                  WLD: 0.385
                }
              }),
              onMessage: {
                addListener: (callback) => {
                  // Mock message listener - doesn't actually receive messages in demo
                },
                removeListener: (callback) => {
                  // Mock remove listener
                }
              },
              lastError: null
            },
            tabs: {
              query: (opts, callback) => callback([]),
              sendMessage: () => {}
            }
          };
        `;
  iframeDoc.body.appendChild(scriptEl);

  // Add detector script
  const detectorScriptEl = iframeDoc.createElement("script");
  detectorScriptEl.textContent = detectorScript;
  iframeDoc.body.appendChild(detectorScriptEl);

  // Add popup script
  const popupScriptEl = iframeDoc.createElement("script");
  popupScriptEl.textContent = popupScript;
  iframeDoc.body.appendChild(popupScriptEl);

  // Add demo restrictions script
  const demoRestrictionsEl = iframeDoc.createElement("script");
  demoRestrictionsEl.textContent = `
          // Add demo restrictions after DOM is ready
          setTimeout(() => {
            // Debug: Log theme toggle button position
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
              const rect = themeToggle.getBoundingClientRect();
              
            }
            // Add warning banner for Crypto settings tab
            const settingsTabs = document.querySelectorAll('.settings-tab-button');
            settingsTabs.forEach(tab => {
              if (tab.textContent.includes('Crypto')) {
                tab.addEventListener('click', () => {
                  setTimeout(() => {
                    const cryptoSettings = document.getElementById('crypto-settings');
                    if (cryptoSettings && !document.getElementById('demo-warning-crypto')) {
                      const warning = document.createElement('div');
                      warning.id = 'demo-warning-crypto';
                      warning.className = 'demo-warning';
                      warning.innerHTML = '<span>⚠️ Disabled for demo</span>';
                      cryptoSettings.insertBefore(warning, cryptoSettings.firstChild);
                      
                      // Disable all radio buttons and inputs
                      const inputs = cryptoSettings.querySelectorAll('input, button');
                      inputs.forEach(input => {
                        input.disabled = true;
                        input.style.opacity = '0.5';
                        input.style.cursor = 'not-allowed';
                      });
                      
                      // Disable labels too
                      const labels = cryptoSettings.querySelectorAll('label');
                      labels.forEach(label => {
                        label.style.opacity = '0.5';
                        label.style.cursor = 'not-allowed';
                      });
                    }
                  }, 50);
                });
              }
            });
            
            // Add warning banner for Disabled URLs settings
            settingsTabs.forEach(tab => {
              if (tab.textContent.includes('Disabled URLs')) {
                tab.addEventListener('click', () => {
                  setTimeout(() => {
                    const disabledUrlsSettings = document.getElementById('disabled-urls-settings');
                    if (disabledUrlsSettings && !document.getElementById('demo-warning-urls')) {
                      const warning = document.createElement('div');
                      warning.id = 'demo-warning-urls';
                      warning.className = 'demo-warning';
                      warning.innerHTML = '<span>⚠️ Disabled for demo</span>';
                      disabledUrlsSettings.insertBefore(warning, disabledUrlsSettings.firstChild);
                      
                      // Disable all inputs and buttons
                      const inputs = disabledUrlsSettings.querySelectorAll('input, button');
                      inputs.forEach(input => {
                        input.disabled = true;
                        input.style.opacity = '0.5';
                        input.style.cursor = 'not-allowed';
                      });
                      
                      // Make the whole content area look disabled
                      const urlsList = document.getElementById('disabled-urls-list');
                      if (urlsList) {
                        urlsList.style.opacity = '0.5';
                        urlsList.style.pointerEvents = 'none';
                      }
                    }
                  }, 50);
                });
              }
            });
          }, 500);
        `;
  iframeDoc.body.appendChild(demoRestrictionsEl);

  // Add demo warning styles
  const demoStyleEl = iframeDoc.createElement("style");
  demoStyleEl.textContent = `
          .demo-warning {
            background: #fff3cd;
            border: 1px solid #ffeeba;
            color: #856404;
            padding: 10px 15px;
            margin: 10px 0;
            border-radius: 5px;
            font-size: 13px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
          }
          
          .demo-warning span {
            font-weight: 500;
          }
          
          /* Dark theme support for demo warning */
          [data-theme="dark"] .demo-warning {
            background: #3a3a2a;
            border-color: #5a5a3a;
            color: #ffc107;
          }
          
          /* Disabled state styling */
          .currency-item[disabled],
          input[disabled],
          button[disabled] {
            cursor: not-allowed !important;
          }
        `;
  iframeDoc.head.appendChild(demoStyleEl);

  // Convert to HTML string
  const iframeContent = "<!DOCTYPE html>" + iframeDoc.documentElement.outerHTML;

  // Write to iframe
  iframe.srcdoc = iframeContent;

  // Listen for messages from iframe
  window.addEventListener("message", (event) => {
    if (event.data.type === "updateDemoState") {
      // Update demo state when settings change
      if (event.data.data.appearance)
        Object.assign(demoState, event.data.data.appearance);
      if (event.data.data.theme) {
        demoState.theme = event.data.data.theme;
        // Update the main page theme when extension theme changes
        document.documentElement.setAttribute("data-theme", demoState.theme);
        // Hide the arrow after first interaction
        const arrow = document.querySelector(".arrow-container");
        if (arrow && !arrow.classList.contains("hidden")) {
          arrow.classList.add("hidden");
        }
      }
      if (event.data.data.selectedCurrencies)
        demoState.selectedCurrencies = event.data.data.selectedCurrencies;

      // Update price demo
      updatePriceStyles();
      updateTooltipCurrencies();
    }
  });

  // Set initial theme
  document.documentElement.setAttribute("data-theme", demoState.theme);

  // Hide top arrow on any interaction with the iframe
  iframe.addEventListener("load", () => {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.addEventListener("click", () => {
      const topArrow = document.querySelector(".arrow-container-top");
      if (topArrow && !topArrow.classList.contains("hidden")) {
        topArrow.classList.add("hidden");
      }
    });

    // Send initial theme to iframe
    iframe.contentWindow.postMessage(
      {
        type: "updateTheme",
        theme: demoState.theme,
      },
      "*"
    );
  });
});

function updatePriceStyles() {
  const priceItems = document.querySelectorAll(".price-item");
  const tooltips = document.querySelectorAll(".cc-tooltip");

  priceItems.forEach((item, index) => {
    // Reset styles
    item.style.border = "";
    item.style.borderBottom = "";
    item.style.background = "";
    item.style.borderRadius = "";

    // Apply highlight style
    if (demoState.highlightStyle === "underline") {
      item.style.borderBottom = `${demoState.borderThickness}px ${demoState.borderStyle} ${demoState.borderColor}`;
      item.style.background = hexToRgba(
        demoState.backgroundColor,
        demoState.backgroundOpacity / 100
      );
    } else if (demoState.highlightStyle === "border") {
      item.style.border = `${demoState.borderThickness}px ${demoState.borderStyle} ${demoState.borderColor}`;
      item.style.background = hexToRgba(
        demoState.backgroundColor,
        demoState.backgroundOpacity / 100
      );
    } else if (demoState.highlightStyle === "background") {
      item.style.background = hexToRgba(
        demoState.backgroundColor,
        demoState.backgroundOpacity / 100
      );
    }

    item.style.borderRadius = demoState.borderRadius + "px";
  });

  // Update tooltip theme
  tooltips.forEach((tooltip) => {
    tooltip.className = `cc-tooltip ${demoState.tooltipTheme}`;
  });
}

function updateTooltipCurrencies() {
  // Update tooltip content based on selected currencies
  const rates = {
    // Fiat rates (how many units of currency per USD)
    USD: 1,
    EUR: 0.925,
    GBP: 0.796,
    JPY: 149.85,
    CAD: 1.35,
    AUD: 1.52,
    CHF: 0.91,
    CNY: 7.24,
    INR: 83.25,
    KRW: 1318.5,
    MXN: 17.85,
    BRL: 4.98,
    SGD: 1.35,
    HKD: 7.83,
    NZD: 1.64,
    SEK: 10.48,
    NOK: 10.65,
    DKK: 6.89,
    PLN: 4.01,
    // Crypto rates (how many crypto units per USD)
    BTC: 0.0000231,
    ETH: 0.000432,
    BNB: 0.00317,
    XRP: 1.613,
    SOL: 0.00445,
    DOGE: 3.125,
    ADA: 1.563,
    LTC: 0.00893,
    DOT: 0.143,
    XMR: 0.00485,
    AAVE: 0.00625,
    CRO: 10.526,
    PEPE: 41666.67,
    TRUMP: 0.0833,
    VET: 31.25,
    RENDER: 0.179,
    WLD: 0.385,
  };

  const symbols = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    CAD: "C$",
    AUD: "A$",
    CHF: "Fr",
    CNY: "¥",
    INR: "₹",
    KRW: "₩",
    MXN: "$",
    BRL: "R$",
    SGD: "S$",
    HKD: "HK$",
    NZD: "NZ$",
    SEK: "kr",
    NOK: "kr",
    DKK: "kr",
    PLN: "zł",
    BTC: "₿",
    ETH: "Ξ",
    BNB: "",
    XRP: "",
    SOL: "",
    DOGE: "Ð",
    ADA: "₳",
    LTC: "Ł",
    DOT: "",
    XMR: "",
    AAVE: "",
    CRO: "",
    PEPE: "",
    TRUMP: "",
    VET: "",
    RENDER: "",
    WLD: "",
  };

  document.querySelectorAll(".price-item").forEach((item, index) => {
    const tooltip = item.querySelector(".cc-tooltip");
    const amount = parseFloat(item.dataset.amount);
    const fromCurrency = item.dataset.currency;

    // Build tooltip content with proper structure
    let html = '<div class="cc-tooltip-content">';

    // First add all non-base currencies
    const nonBaseCurrencies = demoState.selectedCurrencies.filter(
      (currency) => currency !== fromCurrency
    );
    nonBaseCurrencies.forEach((currency) => {
      let converted;

      // Check if it's crypto
      const isCrypto = [
        "BTC",
        "ETH",
        "BNB",
        "XRP",
        "SOL",
        "DOGE",
        "ADA",
        "LTC",
        "DOT",
        "XMR",
        "AAVE",
        "CRO",
        "PEPE",
        "TRUMP",
        "VET",
        "RENDER",
        "WLD",
      ].includes(currency);

      if (isCrypto) {
        // For crypto: rates are already in "units per USD" format
        if (fromCurrency === "USD") {
          // Direct conversion: USD amount * crypto units per USD
          converted = amount * rates[currency];
        } else {
          // Convert to USD first, then to crypto
          const usdAmount = amount / rates[fromCurrency];
          converted = usdAmount * rates[currency];
        }
      } else {
        // For fiat: standard conversion
        const fromRate = rates[fromCurrency] || 1;
        const toRate = rates[currency] || 1;
        converted = amount * (toRate / fromRate);
      }

      const symbol = symbols[currency] || "";
      let formatted;

      if (currency === "JPY" || currency === "KRW" || currency === "IDR") {
        formatted = Math.round(converted).toLocaleString();
      } else if (isCrypto) {
        // Format crypto based on value
        if (converted < 0.00001) {
          formatted = converted.toExponential(2);
        } else if (converted < 0.01) {
          formatted = converted.toFixed(6);
        } else if (converted < 1) {
          formatted = converted.toFixed(4);
        } else {
          formatted = converted.toFixed(2);
        }
      } else {
        formatted = converted.toFixed(2);
      }

      html += `
          <div class="cc-tooltip-item">
            <span class="cc-tooltip-currency">${currency}</span>
            <span class="cc-tooltip-value">${symbol}${
              symbol ? " " : ""
            }${formatted}</span>
          </div>
        `;
    });

    // Add divider with "Converts to" text
    if (nonBaseCurrencies.length > 0) {
      html += `
        <div class="tooltip-divider">
          <span class="tooltip-divider-text">Converts to</span>
        </div>
      `;
    }

    // Add base currency at the bottom
    const baseSymbol = symbols[fromCurrency] || "";
    html += `
      <div class="cc-tooltip-item base-currency">
        <span class="cc-tooltip-currency">${fromCurrency}</span>
        <span class="cc-tooltip-value">${baseSymbol}${
          baseSymbol ? " " : ""
        }${amount.toFixed(2)}</span>
      </div>
    `;

    html += "</div>";
    tooltip.innerHTML = html;
  });
}

function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(
        result[3],
        16
      )}, ${alpha})`
    : hex;
}

// Price hover effects
document.querySelectorAll(".price-item").forEach((item, index) => {
  const tooltip = item.querySelector(".cc-tooltip");

  item.addEventListener("mouseenter", function () {
    tooltip.classList.add("show");

    // Apply hover styles
    if (demoState.highlightStyle === "underline") {
      this.style.borderBottomColor = demoState.borderHoverColor;
      this.style.background = hexToRgba(
        demoState.backgroundHoverColor,
        demoState.backgroundOpacity / 100
      );
    } else if (demoState.highlightStyle === "border") {
      this.style.borderColor = demoState.borderHoverColor;
      this.style.background = hexToRgba(
        demoState.backgroundHoverColor,
        demoState.backgroundOpacity / 100
      );
    } else if (demoState.highlightStyle === "background") {
      this.style.background = hexToRgba(
        demoState.backgroundHoverColor,
        demoState.backgroundOpacity / 100
      );
    }
  });

  item.addEventListener("mouseleave", function () {
    tooltip.classList.remove("show");
    updatePriceStyles(); // Reset to non-hover state
  });
});

// Intersection Observer for fade-in animations
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll(".fade-in").forEach((el) => {
  observer.observe(el);
});

// Initialize styles
updatePriceStyles();
updateTooltipCurrencies();

// Page theme toggle
const pageThemeToggle = document.getElementById("page-theme-toggle");
pageThemeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  // Update page theme
  document.documentElement.setAttribute("data-theme", newTheme);
  demoState.theme = newTheme;

  // Update iframe theme
  const iframe = document.getElementById("extension-demo-frame");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      {
        type: "updateTheme",
        theme: newTheme,
      },
      "*"
    );
  }
});

// Contact form submission
const contactForm = document.getElementById("contact-form");
if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Validate reCAPTCHA
    const recaptchaResponse = grecaptcha.getResponse();
    if (!recaptchaResponse) {
      alert("Please complete the reCAPTCHA verification.");
      return;
    }

    const submitButton = contactForm.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;

    // Create spinner HTML
    const spinnerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <svg class="spinner" style="width: 16px; height: 16px; animation: rotate 1s linear infinite;" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4" stroke-dashoffset="10.5" style="animation: dash 1.5s ease-in-out infinite;"></circle>
        </svg>
        Sending...
      </span>
    `;

    // Add spinner animation styles if not already present
    if (!document.getElementById("spinner-styles")) {
      const style = document.createElement("style");
      style.id = "spinner-styles";
      style.textContent = `
        @keyframes rotate {
          100% { transform: rotate(360deg); }
        }
        @keyframes dash {
          0% { stroke-dashoffset: 31.4; }
          50% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -31.4; }
        }
      `;
      document.head.appendChild(style);
    }

    // Lock the button and show spinner
    submitButton.innerHTML = spinnerHTML;
    submitButton.disabled = true;
    submitButton.style.cursor = "not-allowed";
    submitButton.style.opacity = "0.7";

    try {
      const formData = new FormData(contactForm);
      // Don't append g-recaptcha-response - it's already in the form

      const response = await fetch(contactForm.action, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success
        contactForm.innerHTML = `
          <div style="text-align: center; padding: 40px;">
            <h3 style="color: #28a745; margin-bottom: 20px;">✓ Message Sent!</h3>
            <p>${result.message || "Thank you for your message! We'll get back to you soon."}</p>
          </div>
        `;
      } else {
        // Error - unlock the button
        alert(result.error || "Failed to send message. Please try again.");
        submitButton.innerHTML = originalText;
        submitButton.disabled = false;
        submitButton.style.cursor = "";
        submitButton.style.opacity = "";
        // Reset reCAPTCHA
        grecaptcha.reset();
      }
    } catch (error) {
      alert("Network error. Please try again later.");
      // Unlock the button
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;
      submitButton.style.cursor = "";
      submitButton.style.opacity = "";
      // Reset reCAPTCHA
      grecaptcha.reset();
    }
  });
}

// Cookie Consent Management
function initCookieConsent() {
  const banner = document.getElementById("cookie-consent-banner");
  const acceptBtn = document.querySelector(".cookie-consent-accept");
  const declineBtn = document.querySelector(".cookie-consent-decline");

  // Check if user has already made a choice
  const consentData = localStorage.getItem("cookieConsent");

  if (!consentData) {
    // Show banner if no consent data exists
    banner.style.display = "block";
  } else {
    // Apply saved preferences
    const consent = JSON.parse(consentData);
    applyConsent(consent);
  }

  // Helper function to update consent
  function updateConsent(analytics, marketing) {
    const consent = {
      necessary: true,
      analytics: analytics,
      marketing: marketing,
      timestamp: new Date().toISOString(),
    };

    // Save to localStorage
    localStorage.setItem("cookieConsent", JSON.stringify(consent));

    // Apply consent
    applyConsent(consent);

    // Hide banner
    banner.style.display = "none";
  }

  // Apply consent settings to Google Tag Manager
  function applyConsent(consent) {
    gtag("consent", "update", {
      analytics_storage: consent.analytics ? "granted" : "denied",
      ad_storage: consent.marketing ? "granted" : "denied",
      ad_user_data: consent.marketing ? "granted" : "denied",
      ad_personalization: consent.marketing ? "granted" : "denied",
    });
  }

  // Button handlers
  acceptBtn.addEventListener("click", () => {
    updateConsent(true, false); // analytics: true, marketing: false
  });

  declineBtn.addEventListener("click", () => {
    updateConsent(false, false);
  });

  // Add preferences button to footer if consent exists
  if (consentData) {
    addPreferencesButton();
  }
}

// Add a button to change cookie preferences
function addPreferencesButton() {
  const footer = document.querySelector("footer");
  if (!footer) return;

  const footerLinks = footer.querySelector(".footer-links");
  if (!footerLinks) return;

  const preferencesBtn = document.createElement("a");
  preferencesBtn.textContent = "Cookie Settings";
  preferencesBtn.href = "#";

  preferencesBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const banner = document.getElementById("cookie-consent-banner");
    banner.style.display = "block";
  });

  // Insert at the beginning of footer links
  footerLinks.insertBefore(preferencesBtn, footerLinks.firstChild);
}

// Initialize cookie consent when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCookieConsent);
} else {
  initCookieConsent();
}
