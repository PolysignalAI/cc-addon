# Currency Converter Extension - Project Structure

## Directory Layout

```
cc-addon/
├── cc/                          # Main source code
│   ├── src/                     # JavaScript source files
│   │   ├── modules/             # Modular architecture (refactored from monolithic content.js)
│   │   │   ├── core/           # Core functionality
│   │   │   │   ├── Settings.js          # Settings management & Chrome storage
│   │   │   │   ├── MessageHandler.js    # Chrome/Firefox messaging API
│   │   │   │   └── PriceConverter.js    # Main coordinator (56 lines, was 2732)
│   │   │   ├── detection/      # Currency & price detection
│   │   │   │   ├── CurrencyDetector.js  # Detects currencies from page content
│   │   │   │   ├── PatternMatcher.js    # Regex pattern matching for prices
│   │   │   │   └── PriceExtractor.js    # Extract & validate numeric prices
│   │   │   ├── conversion/     # Currency conversion
│   │   │   │   └── CurrencyConverter.js # Conversion calculations & formatting
│   │   │   └── ui/             # User interface
│   │   │       ├── TooltipManager.js    # Tooltip display & positioning
│   │   │       └── StyleManager.js      # Dynamic CSS injection
│   │   ├── content.js          # Entry point (orchestrator only, 56 lines)
│   │   ├── background.js       # Background service worker
│   │   ├── popup.js            # Extension popup logic
│   │   ├── popup.html          # Extension popup UI
│   │   ├── currency-detector.js # Standalone detector for popup
│   │   └── constants.js        # All constants & configuration
│   └── icons/                  # Extension icons
├── chrome/                     # Built Chrome extension (generated)
├── firefox/                    # Built Firefox extension (generated)
├── web/                        # Website & demo
│   └── addon/                  # Interactive demo (generated)
├── build.js                    # Build script (bundles modules)
├── manifest-chrome.json        # Chrome Manifest V3
├── manifest-firefox.json       # Firefox Manifest V2
└── CLAUDE.md                   # Project rules & context

## Key Files

### Source Organization
- **constants.js**: Central configuration including currencies, symbols, patterns, and UI constants
- **content.js**: Minimal entry point that initializes PriceConverter
- **modules/**: Clean separation of concerns with 9 focused modules

### Build System
- **build.js**: Bundles ES6 modules into browser-compatible code
  - Removes import/export statements
  - Handles Chrome/Firefox API differences
  - Outputs to chrome/, firefox/, and web/addon/

## Module Responsibilities

1. **Core Modules**
   - `Settings`: Load/save user preferences
   - `MessageHandler`: Handle extension messaging
   - `PriceConverter`: Coordinate all modules

2. **Detection Modules**
   - `CurrencyDetector`: Find currencies in text/meta tags
   - `PatternMatcher`: Match price patterns with regex
   - `PriceExtractor`: Parse numeric values from text

3. **Conversion Module**
   - `CurrencyConverter`: Calculate conversions & format output

4. **UI Modules**
   - `TooltipManager`: Show conversion tooltips on hover
   - `StyleManager`: Apply user's appearance preferences

## Development Workflow

1. Edit files only in `cc/src/` directory
2. Run `node build.js` to generate extension files
3. Load `chrome/` or `firefox/` directory in browser
4. Never edit files in output directories (chrome/, firefox/, web/addon/)
```
