<p align="center">
  <img src="web/assets/github.png" alt="Currency Converter" />
</p>

A browser extension that automatically detects and converts prices on any webpage to your preferred currencies in real-time.

## Features

### Smart Price Detection

- **Automatic Detection**: Intelligently identifies prices in 30+ currencies on any webpage
- **Advanced Pattern Recognition**: Detects various price formats including symbols ($, €, £, ¥, ₹), codes (USD, EUR), and complex formats
- **Multi-Currency Prices**: Handles price ranges and multiple currencies on the same page

### Comprehensive Currency Support

- **30+ Fiat Currencies**: USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, and more
- **20+ Cryptocurrencies**: BTC, ETH, USDT, BNB, SOL, ADA, DOGE, and more
- **Bitcoin Denominations**: Display as BTC, Satoshis, or dynamic based on value
- **Real-Time Exchange Rates**: Live rates from Frankfurter.dev API and CoinGecko

### User Experience

- **Instant Hover Tooltips**: See conversions without clicking - just hover over any price
- **Dark/Light Theme**: Seamless theme switching that follows your preference
- **Favorites System**: Star your most-used currencies for quick access

### Advanced Features

- **Built-in Currency Converter**: Quick conversion tool right in the popup
- **Auto-Detection**: Automatically sets base currency based on your timezone
- **URL Exclusions**: Disable the extension on specific websites using regex patterns
- **Customizable Appearance**: Choose underline, border, or background highlighting
- **Performance Optimized**: Smart caching, chunked processing, and debounced updates

## Installation

### Chrome Web Store

Coming soon!

### Firefox Add-ons

Coming soon!

### Manual Installation

#### Chrome/Edge

1. Download the latest release from [Releases](https://github.com/PolysignalAI/cc-addon/releases)
2. Extract the `chrome-extension.zip` file
3. Open Chrome/Edge and go to `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extracted folder

#### Firefox

1. Download the latest release from [Releases](https://github.com/PolysignalAI/cc-addon/releases)
2. Extract the `firefox-extension.zip` file
3. Open Firefox and go to `about:debugging`
4. Click "This Firefox"
5. Click "Load Temporary Add-on" and select `manifest.json` from the extracted folder

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/PolysignalAI/cc-addon.git
cd cc-addon

# Build the extension
node build.js
```

### Project Structure

```
cc/src/                  # Source code
├── modules/             # Modular architecture (9 focused modules)
│   ├── core/            # Settings, messaging, main coordinator
│   ├── detection/       # Currency & price detection logic
│   ├── conversion/      # Currency calculations
│   └── ui/              # Tooltips & styling
├── content.js           # Entry point (56 lines, was 2732)
├── background.js        # Service worker
├── popup.js/html        # Extension popup
├── currency-detector.js # Auto-detection for popup
└── constants.js         # All configuration
chrome/firefox/          # Built extensions (generated)
web/                     # Website & interactive demo
```

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for detailed module information.

### Building from Source

```bash
# Install dependencies (required for formatting tools)
npm install

# Build for both browsers (development)
node build.js

# Build for production (forces DEBUG=false)
node build.js --production
```

The build script creates bundles for Chrome and Firefox based on the source in the `cc/` folder.

**Note:** The `--production` flag automatically sets `DEBUG=false` in the source code to ensure no debug logs appear in production builds.

## Contributing

We welcome contributions! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Setup

1. Clone the repository
2. Run `npm install` to install development dependencies
3. Make your changes in the `cc/src/` directory
4. Run `node build.js` to build the addon in `chrome` and `firefox` folders
5. If changing the interactive demo for the website, `node build.sh` will also update the `web/addon` folder.

### Development Guidelines

1. **Code Style**: Code is automatically formatted with Prettier on commit
2. **Testing**: Tests run automatically on commits to `cc/src/` files. All tests must pass before merging
3. **Commit Messages**: Use conventional commits format:
   - `feat: add new feature`
   - `fix: resolve bug`
   - `docs: update documentation`
   - See [commit guidelines](.husky/commit-msg) for all types
4. **Cross-browser compatibility**: Test on both Chrome and Firefox
5. **Documentation**: Update relevant docs in the `docs/` folder
6. **Website**: Make sure the website interactive demo still functions appropriately. The easiest way is to serve the `web` folder by using something like: `python -m http.server 8000` inside the `web` dir.

### Available Commands

```bash
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
npm run format        # Format all files
npm run format:check  # Check formatting without changing files
node build.js         # Build extension for all browsers
node build.js --production # Build for production (DEBUG=false)
node toggle-debug.js  # Toggle debug logging on/off
```

### Additional Documentation

- [Deployment Guide](docs/DEPLOY.md) - How to deploy the website and create releases
- [Formatting Guide](docs/FORMATTING.md) - Code formatting standards and setup

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Privacy

- No user data is collected or transmitted
- All settings are stored locally in your browser
- Exchange rate APIs are accessed directly (no proxy servers)
- See our [Privacy Policy](https://cc.polysignal.com/privacy) for more details

## Acknowledgments

- Exchange rates provided by [frankfurter.dev](https://frankfurter.dev/) and [CoinGecko](https://coingecko.com/)

## Contact

For support or inquiries, please visit our [website](https://cc.polysignal.com) or open an issue on GitHub.

---

Made with ❤️ by [Polysignal](https://polysignal.com)
