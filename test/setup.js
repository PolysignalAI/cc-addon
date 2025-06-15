// Import constants from the actual source
const fs = require("fs");
const path = require("path");

// Load constants.js and extract DEFAULT_SETTINGS
const constantsSource = fs.readFileSync(
  path.join(__dirname, "../cc/src/constants.js"),
  "utf8"
);
const defaultSettingsMatch = constantsSource.match(
  /export\s+const\s+DEFAULT_SETTINGS\s*=\s*({[\s\S]*?});/
);
let DEFAULT_SETTINGS = {
  selectedCurrencies: ["USD", "EUR", "GBP", "BTC"],
  favoriteCurrencies: ["USD", "EUR", "GBP", "BTC", "ETH"],
  baseCurrency: "USD",
  appearance: {
    highlightStyle: "underline",
    borderColor: "#007bff",
    borderHoverColor: "#218838",
    backgroundColor: "#007bff",
    backgroundHoverColor: "#218838",
    borderThickness: 2,
    borderRadius: 0,
    borderStyle: "solid",
    backgroundOpacity: 10,
    tooltipTheme: "dark",
  },
};

if (defaultSettingsMatch) {
  try {
    // Use Function constructor to safely evaluate the object
    DEFAULT_SETTINGS = new Function("return " + defaultSettingsMatch[1])();
  } catch (e) {
    console.warn(
      "Failed to parse DEFAULT_SETTINGS from constants.js, using fallback values"
    );
  }
}

// Mock chrome storage API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        // Return values from actual DEFAULT_SETTINGS
        callback({
          selectedCurrencies: DEFAULT_SETTINGS.selectedCurrencies,
          baseCurrency: DEFAULT_SETTINGS.baseCurrency,
          favoriteCurrencies: DEFAULT_SETTINGS.favoriteCurrencies,
          disabledUrls: [],
          extensionEnabled: true,
          appearance: DEFAULT_SETTINGS.appearance,
        });
      }),
      set: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
  },
};

// window.location is already provided by jsdom

// Mock MutationObserver
global.MutationObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
};

// Mock IntersectionObserver
global.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
};
