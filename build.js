const fs = require("fs");
const path = require("path");

// Force DEBUG flag to false for production builds
function setDebugFlagForProduction() {
  const constantsPath = path.join(__dirname, "cc/src/constants.js");
  let constantsContent = fs.readFileSync(constantsPath, "utf8");

  const debugMatch = constantsContent.match(
    /export\s+const\s+DEBUG\s*=\s*(true|false)/
  );

  if (!debugMatch) {
    console.error("❌ ERROR: Could not find DEBUG flag in constants.js");
    process.exit(1);
  }

  if (debugMatch[1] === "true") {
    constantsContent = constantsContent.replace(
      /export\s+const\s+DEBUG\s*=\s*true/,
      "export const DEBUG = false"
    );
    fs.writeFileSync(constantsPath, constantsContent);
    console.log(
      "⚠️ Production build: DEBUG flag was changed from true to false"
    );
  } else {
    console.log("✓ DEBUG flag already set to false");
  }
}

// Helper function to copy files recursively
function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursive(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Helper function to remove directory recursively
function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        removeDir(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dir);
  }
}

// Read all module files
function readModule(modulePath) {
  if (!fs.existsSync(modulePath)) {
    console.warn(`Module not found: ${modulePath}`);
    return "";
  }
  return fs.readFileSync(modulePath, "utf8");
}

// Bundle content script with all modules
function bundleContent(outputDir) {
  console.log("Bundling content.js with all modules...");

  // Read constants
  let constantsContent = readModule(
    path.join(__dirname, "cc/src/constants.js")
  );

  // Read all modules in order of dependencies
  const modules = [
    // Core modules (ordered by dependencies)
    "modules/core/StateManager.js",
    "modules/core/MessageBus.js",
    "modules/core/Settings.js",
    "modules/core/MessageHandler.js",
    "modules/core/ExchangeRateManager.js",

    // Detection modules
    "modules/detection/CurrencyDetector.js",
    "modules/detection/PriceExtractor.js",
    "modules/detection/PatternMatcher.js",

    // Conversion modules
    "modules/conversion/CurrencyConverter.js",

    // UI modules
    "modules/ui/TooltipManager.js",
    "modules/ui/StyleManager.js",

    // Main coordinator
    "modules/core/PriceConverter.js",
  ];

  let modulesContent = "";
  for (const modulePath of modules) {
    const content = readModule(path.join(__dirname, "cc/src", modulePath));
    if (content) {
      // Remove import/export statements
      let cleanContent = content
        .replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, "")
        .replace(/export\s+(?:default\s+)?class\s+/g, "class ")
        .replace(/export\s+class\s+/g, "class ")
        .replace(/export\s+{[^}]+};?\s*/g, "");

      modulesContent += `\n// Module: ${modulePath}\n${cleanContent}\n`;
    }
  }

  // Read main content script
  let contentContent = readModule(path.join(__dirname, "cc/src/content.js"));

  // Remove import statements from content.js
  contentContent = contentContent
    .replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, "")
    .replace(/export\s*{[^}]+};?\s*/g, "");

  // Remove export statements from constants
  constantsContent = constantsContent
    .replace(/export\s+(?:const|let|var)\s+/g, "const ")
    .replace(/export\s*{[^}]+}/g, "");

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes("firefox")) {
    constantsContent = constantsContent.replace(/chrome\./g, "browser.");
    modulesContent = modulesContent.replace(/chrome\./g, "browser.");
    contentContent = contentContent.replace(/chrome\./g, "browser.");
  }

  const bundledContent = `// Auto-generated bundled content script
// Built from modular architecture
${constantsContent}

${modulesContent}

${contentContent}`;

  fs.writeFileSync(path.join(outputDir, "src/content.js"), bundledContent);
}

// Bundle background script
function bundleBackground(outputDir) {
  console.log("Bundling background.js with required modules...");

  const constantsPath = path.join(__dirname, "cc/src/constants.js");
  const backgroundPath = path.join(__dirname, "cc/src/background.js");

  let constantsContent = fs.readFileSync(constantsPath, "utf8");
  let backgroundContent = fs.readFileSync(backgroundPath, "utf8");

  // Read required modules for background
  const backgroundModules = [
    "modules/core/MessageBus.js",
    "modules/core/ExchangeRateManager.js",
  ];

  let modulesContent = "";
  for (const modulePath of backgroundModules) {
    const content = readModule(path.join(__dirname, "cc/src", modulePath));
    if (content) {
      // Remove import/export statements
      let cleanContent = content
        .replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, "")
        .replace(/export\s+(?:default\s+)?class\s+/g, "class ")
        .replace(/export\s+class\s+/g, "class ")
        .replace(/export\s*{[^}]+};?\s*/g, "");

      modulesContent += `\n// Module: ${modulePath}\n${cleanContent}\n`;
    }
  }

  // Remove export/import statements
  constantsContent = constantsContent.replace(
    /export\s+(?:const|let|var)\s+/g,
    "const "
  );
  constantsContent = constantsContent.replace(/export\s*{[^}]+}/g, "");
  backgroundContent = backgroundContent.replace(
    /import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g,
    ""
  );

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes("firefox")) {
    constantsContent = constantsContent.replace(/chrome\./g, "browser.");
    modulesContent = modulesContent.replace(/chrome\./g, "browser.");
    backgroundContent = backgroundContent.replace(/chrome\./g, "browser.");
  }

  const bundledContent = `// Auto-generated bundled background script
${constantsContent}

${modulesContent}

${backgroundContent}`;

  fs.writeFileSync(path.join(outputDir, "src/background.js"), bundledContent);
}

// Bundle currency detector for popup
function bundleCurrencyDetector(outputDir) {
  // In the new architecture, we'll create a minimal currency detector for the popup
  const constantsPath = path.join(__dirname, "cc/src/constants.js");
  let constantsContent = fs.readFileSync(constantsPath, "utf8");

  // The popup needs the old CurrencyDetector class for auto-detection
  // We'll use the module version
  const detectorContent = readModule(
    path.join(__dirname, "cc/src/modules/detection/CurrencyDetector.js")
  );

  // Create a simplified version for the popup
  const currencyDetectorContent = `
class CurrencyDetector {
  constructor() {
    this.baseCurrency = DEFAULT_SETTINGS.baseCurrency;
  }

  detectBaseCurrency() {
    // Try locale-based detection first
    const localeCurrency = this.detectFromLocale();
    if (localeCurrency) {
      this.baseCurrency = localeCurrency;
      return localeCurrency;
    }

    // Try timezone-based detection
    const timezoneCurrency = this.detectFromTimezone();
    if (timezoneCurrency) {
      this.baseCurrency = timezoneCurrency;
      return timezoneCurrency;
    }

    // Try language-based detection
    const languageCurrency = this.detectFromLanguage();
    if (languageCurrency) {
      this.baseCurrency = languageCurrency;
      return languageCurrency;
    }

    return this.baseCurrency;
  }

  detectFromLocale() {
    const locale = navigator.language || navigator.userLanguage;
    return LOCALE_CURRENCY_MAP[locale] || null;
  }

  detectFromTimezone() {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return TIMEZONE_CURRENCY_MAP[timezone] || null;
    } catch (error) {
      console.warn("Timezone detection failed:", error);
      return null;
    }
  }

  detectFromLanguage() {
    const language = navigator.language.split("-")[0];
    return LANGUAGE_CURRENCY_MAP[language] || null;
  }

  detectFromCountry() {
    try {
      const locale = navigator.language || navigator.userLanguage;
      const country = locale.split("-")[1];
      return COUNTRY_CURRENCY_MAP[country] || null;
    } catch (error) {
      console.warn("Country detection failed:", error);
      return null;
    }
  }

  getDetectionInfo() {
    const info = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
      languages: navigator.languages,
      detectedCurrency: this.detectBaseCurrency(),
    };
    return info;
  }
}

// Export for use in extension
if (typeof window !== "undefined") {
  window.CurrencyDetector = CurrencyDetector;
}

// Export for Node.js if available
if (typeof module !== "undefined" && module.exports) {
  module.exports = CurrencyDetector;
}
`;

  // Remove export statements from constants
  constantsContent = constantsContent.replace(
    /export\s+(?:const|let|var)\s+/g,
    "const "
  );
  constantsContent = constantsContent.replace(/export\s*{[^}]+}/g, "");

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes("firefox")) {
    constantsContent = constantsContent.replace(/chrome\./g, "browser.");
  }

  const bundledContent = `// Auto-generated bundled currency detector for popup
${constantsContent}

${currencyDetectorContent}`;

  fs.writeFileSync(
    path.join(outputDir, "src/currency-detector.js"),
    bundledContent
  );
}

// Bundle popup script
function bundlePopup(outputDir) {
  console.log("Bundling popup.js with required modules...");

  const popupPath = path.join(__dirname, "cc/src/popup.js");
  let popupContent = fs.readFileSync(popupPath, "utf8");

  // Read MessageBus module for popup
  const messageBusContent = readModule(
    path.join(__dirname, "cc/src/modules/core/MessageBus.js")
  );
  let cleanMessageBus = "";

  if (messageBusContent) {
    cleanMessageBus = messageBusContent
      .replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, "")
      .replace(/export\s+(?:default\s+)?class\s+/g, "class ")
      .replace(/export\s+class\s+/g, "class ")
      .replace(/export\s*{[^}]+};?\s*/g, "");
  }

  // Remove import statements
  popupContent = popupContent.replace(
    /import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g,
    ""
  );

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes("firefox")) {
    cleanMessageBus = cleanMessageBus.replace(/chrome\./g, "browser.");
    popupContent = popupContent.replace(/chrome\./g, "browser.");
  }

  const bundledContent = `// Auto-generated bundled popup script (constants loaded by currency-detector.js)
// Module: MessageBus
${cleanMessageBus}

${popupContent}`;

  fs.writeFileSync(path.join(outputDir, "src/popup.js"), bundledContent);
}

// Main build function
function build() {
  console.log(
    "Building browser extension packages with modular architecture..."
  );

  // Check if production build
  const isProduction = process.argv.includes("--production");
  if (isProduction) {
    console.log("Production build mode enabled");
    setDebugFlagForProduction();
  }

  // Clean existing build directories
  console.log("Cleaning existing build directories...");
  removeDir("chrome");
  removeDir("firefox");

  // Create directories
  fs.mkdirSync("chrome/src", { recursive: true });
  fs.mkdirSync("firefox/src", { recursive: true });

  // Copy static files (HTML, CSS, icons, etc)
  console.log("Copying static files...");

  // Copy everything except src folder
  const ccFiles = fs.readdirSync("cc");
  for (const file of ccFiles) {
    if (file !== "src") {
      copyRecursive(path.join("cc", file), path.join("chrome", file));
      copyRecursive(path.join("cc", file), path.join("firefox", file));
    }
  }

  // Copy HTML and CSS files from src
  const srcStaticFiles = ["popup.html", "popup.css", "content.css"];
  for (const file of srcStaticFiles) {
    const srcPath = path.join("cc/src", file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join("chrome/src", file));
      fs.copyFileSync(srcPath, path.join("firefox/src", file));
    }
  }

  // Handle manifests
  console.log("Setting up manifests...");
  fs.copyFileSync("manifest-chrome.json", "chrome/manifest.json");
  fs.copyFileSync("manifest-firefox.json", "firefox/manifest.json");

  // Bundle JavaScript files
  console.log("Bundling JavaScript files...");

  // Bundle for Chrome
  bundleContent("chrome");
  bundleBackground("chrome");
  bundleCurrencyDetector("chrome");
  bundlePopup("chrome");
  console.log("✅ Chrome bundling complete!");

  // Bundle for Firefox
  bundleContent("firefox");
  bundleBackground("firefox");
  bundleCurrencyDetector("firefox");
  bundlePopup("firefox");
  console.log("✅ Firefox bundling complete!");

  // Bundle for web if applicable
  const webAddonPath = path.join(__dirname, "web/addon");
  if (fs.existsSync(path.dirname(webAddonPath))) {
    console.log("Copying and bundling for web demo...");
    if (!fs.existsSync(webAddonPath)) {
      fs.mkdirSync(webAddonPath, { recursive: true });
    }

    // Copy static files
    for (const file of ccFiles) {
      if (file !== "src") {
        copyRecursive(path.join("cc", file), path.join(webAddonPath, file));
      }
    }

    // Create src directory
    if (!fs.existsSync(path.join(webAddonPath, "src"))) {
      fs.mkdirSync(path.join(webAddonPath, "src"), { recursive: true });
    }

    // Copy HTML and CSS files
    for (const file of srcStaticFiles) {
      const srcPath = path.join("cc/src", file);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(webAddonPath, "src", file));
      }
    }

    // Bundle JS files
    bundleContent(webAddonPath);
    bundleBackground(webAddonPath);
    bundleCurrencyDetector(webAddonPath);
    bundlePopup(webAddonPath);
    console.log("✅ Web addon bundling complete!");
  }

  console.log("\nBuild completed successfully!");
  console.log("Chrome extension files are in: chrome/");
  console.log("Firefox extension files are in: firefox/");
}

// Run build
build();
