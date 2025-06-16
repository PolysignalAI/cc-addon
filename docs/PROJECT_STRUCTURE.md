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
│   │   ├── popup.css           # Extension popup styles
│   │   ├── content.css         # Content script styles
│   │   ├── currency-detector.js # Standalone detector for popup
│   │   └── constants.js        # All constants & configuration
│   └── icons/                  # Extension icons
├── chrome/                     # Built Chrome extension (generated)
├── firefox/                    # Built Firefox extension (generated)
├── web/                        # Website & demo
│   ├── index.html              # Main website
│   ├── index.css               # Website styles
│   ├── index.js                # Website JavaScript
│   ├── privacy.html            # Privacy policy
│   ├── test-debug.html         # Debug/test page
│   ├── assets/                 # Favicons and images
│   ├── addon/                  # Interactive demo (generated)
│   ├── send-email-smtp.php     # Contact form handler (Gmail SMTP)
│   ├── config.example.php      # Example config for email
│   ├── .env.example            # Example environment variables
│   ├── composer.json           # PHP dependencies (PHPMailer)
│   ├── .htaccess              # Apache URL rewriting
├── docs/                       # Documentation
│   ├── PROJECT_STRUCTURE.md    # This file
│   ├── DEPLOY.md              # Deployment guide
│   └── FORMATTING.md          # Code formatting guide
├── .github/                    # GitHub Actions
│   └── workflows/
│       ├── test.yml           # Run tests on PR/push
│       ├── deploy.yml         # Deploy website (tags: 1.0.0)
│       └── release.yml        # Full release (tags: v1.0.0)
├── build.js                    # Build script (bundles modules)
├── manifest-chrome.json        # Chrome Manifest V3
├── manifest-firefox.json       # Firefox Manifest V2
├── package.json               # Node.js dependencies
├── .gitignore                 # Git ignore rules
├── README.md                  # Project readme
└── CLAUDE.md                  # Project rules & context

## Key Files

### Source Organization
- **constants.js**: Central configuration including currencies, symbols, patterns, and UI constants
- **content.js**: Minimal entry point that initializes PriceConverter
- **modules/**: Clean separation of concerns with 9 focused modules
- **popup.js**: Extension popup with settings, currency selection, and converter

### Build System
- **build.js**: Bundles ES6 modules into browser-compatible code
  - Removes import/export statements
  - Handles Chrome/Firefox API differences
  - Outputs to chrome/, firefox/, and web/addon/
  - Supports --production flag for minification

### Website & Contact Form
- **send-email-smtp.php**: PHP contact form using Gmail SMTP via PHPMailer
- **config.example.php**: Configuration template using environment variables
- **.htaccess**: Apache configuration for clean URLs and security
- **composer.json**: Defines PHPMailer dependency

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

## Deployment

### GitHub Actions Workflows

1. **test.yml**: Runs on every push/PR
   - Executes Jest tests
   - Ensures code quality

2. **deploy.yml**: Triggered by tags like `1.0.0`
   - Deploys website only
   - No GitHub release

3. **release.yml**: Triggered by tags like `v1.0.0`
   - Creates Chrome & Firefox extension packages
   - Creates GitHub release
   - Deploys website

### Deployment Process

Both deployment workflows:
- Replace placeholders in HTML with secrets (reCAPTCHA, GTM)
- Deploy files via rsync (excluding config.php, vendor/, .env)
- Create config.php and .env on server with secrets
- Run `composer install --no-dev` on server
- Set secure file permissions

### Required GitHub Secrets

- Server: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `SERVER_DEPLOY_PATH`
- Email: `CONTACT_EMAIL_TO`, `GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`
- reCAPTCHA: `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`
- Analytics: `GTM_CONTAINER_ID`

## Security Features

- Sensitive files excluded from repository (.env, config.php)
- Secrets injected during deployment via GitHub Actions
- Secure file permissions (600 for sensitive files)
- Environment variables for all credentials
- No secrets in public repository or archives
```
