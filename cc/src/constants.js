// Currency-related constants
// Supported fiat currencies from Frankfurter API
export const SUPPORTED_FIAT_CURRENCIES = [
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "RON",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "USD",
  "ZAR",
];

// Fiat currency full names
export const FIAT_CURRENCY_NAMES = {
  AUD: "Australian Dollar",
  BGN: "Bulgarian Lev",
  BRL: "Brazilian Real",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  CNY: "Chinese Renminbi Yuan",
  CZK: "Czech Koruna",
  DKK: "Danish Krone",
  EUR: "Euro",
  GBP: "British Pound",
  HKD: "Hong Kong Dollar",
  HUF: "Hungarian Forint",
  IDR: "Indonesian Rupiah",
  ILS: "Israeli New Sheqel",
  INR: "Indian Rupee",
  ISK: "Icelandic Króna",
  JPY: "Japanese Yen",
  KRW: "South Korean Won",
  MXN: "Mexican Peso",
  MYR: "Malaysian Ringgit",
  NOK: "Norwegian Krone",
  NZD: "New Zealand Dollar",
  PHP: "Philippine Peso",
  PLN: "Polish Złoty",
  RON: "Romanian Leu",
  SEK: "Swedish Krona",
  SGD: "Singapore Dollar",
  THB: "Thai Baht",
  TRY: "Turkish Lira",
  USD: "United States Dollar",
  ZAR: "South African Rand",
};

export const SUPPORTED_CRYPTO_CURRENCIES = [
  "BTC",
  "BTC_SATS",
  "ETH",
  "BNB",
  "XRP",
  "SOL",
  "DOGE",
  "TRX",
  "ADA",
  "BCH",
  "XLM",
  "LTC",
  "DOT",
  "XMR",
  "PEPE",
  "AAVE",
  "PI",
  "CRO",
  "TRUMP",
  "VET",
  "RENDER",
  "WLD",
];

// Crypto currency symbol to name mapping
export const CRYPTO_SYMBOL_TO_NAME = {
  BTC: "Bitcoin",
  BTC_SATS: "BTC (SATS)",
  ETH: "Ethereum",
  BNB: "Binance Coin",
  XRP: "Ripple",
  SOL: "Solana",
  DOGE: "Dogecoin",
  TRX: "TRON",
  ADA: "Cardano",
  BCH: "Bitcoin Cash",
  XLM: "Stellar",
  LTC: "Litecoin",
  DOT: "Polkadot",
  XMR: "Monero",
  PEPE: "Pepe",
  AAVE: "Aave",
  PI: "Pi",
  CRO: "Cronos",
  TRUMP: "Official Trump",
  VET: "VeChain",
  RENDER: "Render",
  WLD: "Worldcoin",
};

// CoinGecko ID to symbol mapping
export const COINGECKO_ID_TO_SYMBOL = {
  bitcoin: "BTC",
  ethereum: "ETH",
  binancecoin: "BNB",
  ripple: "XRP",
  solana: "SOL",
  dogecoin: "DOGE",
  tron: "TRX",
  cardano: "ADA",
  "bitcoin-cash": "BCH",
  stellar: "XLM",
  litecoin: "LTC",
  polkadot: "DOT",
  monero: "XMR",
  pepe: "PEPE",
  aave: "AAVE",
  "pi-network": "PI",
  cronos: "CRO",
  "official-trump": "TRUMP",
  vechain: "VET",
  "render-token": "RENDER",
  "worldcoin-wld": "WLD",
};

export const ALL_SUPPORTED_CURRENCIES = [
  ...SUPPORTED_FIAT_CURRENCIES,
  ...SUPPORTED_CRYPTO_CURRENCIES,
];

// Currency symbols mapping (only for supported fiat currencies)
export const CURRENCY_SYMBOLS = {
  USD: "US$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  INR: "₹",
  TRY: "₺",
  PLN: "zł",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  CHF: "Fr",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
  HKD: "HK$",
  SGD: "S$",
  THB: "฿",
  MXN: "$",
  BRL: "R$",
  ZAR: "R",
  ILS: "₪",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  BGN: "лв",
  IDR: "Rp",
  PHP: "₱",
  MYR: "RM",
  ISK: "kr",
  // Cryptocurrency symbols
  BTC: "₿",
  ETH: "Ξ",
  LTC: "Ł",
  DOGE: "Ð",
  XRP: "✕",
  ADA: "₳",
  DOT: "●",
  XMR: "ɱ",
};

// Reverse mapping for CoinGecko API responses
export const SYMBOL_TO_COINGECKO_ID = Object.fromEntries(
  Object.entries(COINGECKO_ID_TO_SYMBOL).map(([id, symbol]) => [symbol, id])
);

// Price detection patterns
export const PRICE_PATTERNS = [
  // Basic currency symbols
  /\$\s*[\d,]+\.?\d*/g, // $123.45
  /USD\s*[\d,]+\.?\d*/g, // USD 123.45
  /€\s*[\d,]+(?:\.\d{3})*(?:,\d+)?/g, // €1.234,56 (European format)
  /€\s*[\d,]+\.?\d*/g, // €123.45
  /EUR\s*[\d,]+\.?\d*/g, // EUR 123.45
  /£\s*[\d,]+\.?\d*/g, // £123.45
  /GBP\s*[\d,]+\.?\d*/g, // GBP 123.45
  /¥\s*[\d,]+\.?\d*/g, // ¥123.45
  /JPY\s*[\d,]+\.?\d*/g, // JPY 123.45
  /JP\s*¥\s*[\d,]+\.?\d*/g, // JP¥ 123.45 or JP ¥123.45
  /JPY\s*¥\s*[\d,]+\.?\d*/g, // JPY¥ 123.45
  /CN\s*¥\s*[\d,]+\.?\d*/g, // CN¥ 123.45 or CN ¥123.45
  /CNY\s*¥\s*[\d,]+\.?\d*/g, // CNY¥ 123.45
  /RMB\s*[\d,]+\.?\d*/g, // RMB 123.45 (alternative for CNY)
  /元\s*[\d,]+\.?\d*/g, // 元123.45 (Chinese character for yuan)

  // Canadian and Australian dollars (specific patterns)
  /C\$\s*[\d,]+\.?\d*/g, // C$123.45
  /CA\s*\$\s*[\d,]+\.?\d*/g, // CA $123.45 or CA$123.45
  /CAD\s*\$\s*[\d,]+\.?\d*/g, // CAD $123.45 or CAD$123.45
  /A\$\s*[\d,]+\.?\d*/g, // A$123.45
  /AU\s*\$\s*[\d,]+\.?\d*/g, // AU $123.45 or AU$123.45
  /AUD\s*\$\s*[\d,]+\.?\d*/g, // AUD $123.45 or AUD$123.45

  // Other dollar currencies
  /NZ\s*\$\s*[\d,]+\.?\d*/g, // NZ $123.45 or NZ$123.45
  /NZD\s*\$\s*[\d,]+\.?\d*/g, // NZD $123.45 or NZD$123.45
  /S\$\s*[\d,]+\.?\d*/g, // S$123.45 (Singapore)
  /SG\s*\$\s*[\d,]+\.?\d*/g, // SG $123.45 or SG$123.45
  /SGD\s*\$\s*[\d,]+\.?\d*/g, // SGD $123.45 or SGD$123.45
  /HK\s*\$\s*[\d,]+\.?\d*/g, // HK $123.45 or HK$123.45
  /HKD\s*\$\s*[\d,]+\.?\d*/g, // HKD $123.45 or HKD$123.45

  // Indian Rupee
  /₹\s*[\d,]+\.?\d*/g, // ₹99,999
  /₹\s*[\d,]+(?:,\d{2})+(?:\.\d+)?/g, // ₹1,23,456 (Indian format)
  /INR\s*[\d,]+(?:,\d{2})+(?:\.\d+)?/g, // INR 1,23,456
  /INR\s*[\d,]+\.?\d*/g, // INR 123.45

  // Swiss Franc
  /CHF\s*[\d,]+\.?\d*/g, // CHF 789.00

  // Scandinavian currencies (kr is shared by SEK, NOK, DKK, ISK)
  /kr\s*[\d,]+(?:,\d+)?/g, // kr 123,45 (comma as decimal)
  /kr\s*[\d,]+\.?\d*/g, // kr 123.45
  /SEK\s*[\d,]+\.?\d*/g, // SEK 123.45
  /NOK\s*[\d,]+\.?\d*/g, // NOK 123.45
  /DKK\s*[\d,]+\.?\d*/g, // DKK 123.45
  /ISK\s*[\d,]+\.?\d*/g, // ISK 123.45
  /SEK\s*kr\s*[\d,]+\.?\d*/g, // SEKkr 123.45 or SEK kr 123.45
  /NOK\s*kr\s*[\d,]+\.?\d*/g, // NOKkr 123.45 or NOK kr 123.45
  /DKK\s*kr\s*[\d,]+\.?\d*/g, // DKKkr 123.45 or DKK kr 123.45
  /ISK\s*kr\s*[\d,]+\.?\d*/g, // ISKkr 123.45 or ISK kr 123.45
  /[\d,]+\.?\d*\s*kr/g, // 123.45kr (amount before kr)

  // Cryptocurrencies
  /₿\s*[\d,]+\.?\d*/g, // ₿0.00123456
  /\b(?:BTC|ETH|BNB|XRP|SOL|DOGE|TRX|ADA|BCH|XLM|LTC|DOT|XMR|PEPE|AAVE|PI|CRO|TRUMP|VET|RENDER|WLD)\s+[\d,]+\.?\d*/gi, // BTC 0.001
  /\b[\d,]+\.?\d*\s+(?:BTC|ETH|BNB|XRP|SOL|DOGE|TRX|ADA|BCH|XLM|LTC|DOT|XMR|PEPE|AAVE|PI|CRO|TRUMP|VET|RENDER|WLD)\b/gi, // 0.001 BTC

  // General fiat currency pattern (code before number)
  /\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|KRW|MXN|BRL|RUB|SGD|HKD|NZD|SEK|NOK|DKK|PLN|TRY|ZAR|ILS|CZK|HUF|RON|BGN|IDR|PHP|MYR|ISK)\s+[\d,]+\.?\d*/gi,

  // General fiat currency pattern (number before code)
  /\b[\d,]+\.?\d*\s+(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|KRW|MXN|BRL|RUB|SGD|HKD|NZD|SEK|NOK|DKK|PLN|TRY|ZAR|ILS|CZK|HUF|RON|BGN|IDR|PHP|MYR|ISK)\b/gi,

  // Dollar symbol with currency code pattern ($123 USD, $123 HKD, etc.)
  /\$\s*[\d,]+\.?\d*\s+(?:USD|CAD|AUD|NZD|SGD|HKD)\b/gi,
];

// Debug flag - set to false in production
export const DEBUG = false;

// Debug wrapper functions
export const debug = {
  log: DEBUG ? console.log.bind(console) : () => {},
  warn: DEBUG ? console.warn.bind(console) : () => {},
  info: DEBUG ? console.info.bind(console) : () => {},
  error: DEBUG ? console.error.bind(console) : () => {},
};

// Default settings
export const DEFAULT_SETTINGS = {
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

// API endpoints
export const API_ENDPOINTS = {
  FRANKFURTER: "https://api.frankfurter.dev/v1/latest",
  COINGECKO: "https://api.coingecko.com/api/v3/simple/price",
};

// Cache settings
export const CACHE_SETTINGS = {
  maxCacheSize: 1000,
  cacheCleanupInterval: 3600000, // 1 hour
};

// Currency detection mappings
export const LOCALE_CURRENCY_MAP = {
  "en-US": "USD",
  "en-GB": "GBP",
  "en-CA": "CAD",
  "en-AU": "AUD",
  "de-DE": "EUR",
  "fr-FR": "EUR",
  "es-ES": "EUR",
  "it-IT": "EUR",
  "nl-NL": "EUR",
  "pt-PT": "EUR",
  "fi-FI": "EUR",
  "at-AT": "EUR",
  "ja-JP": "JPY",
  "ko-KR": "KRW",
  "zh-CN": "CNY",
  "zh-TW": "TWD",
  "hi-IN": "INR",
  "pt-BR": "BRL",
  "ru-RU": "RUB",
  "tr-TR": "TRY",
  "pl-PL": "PLN",
  "sv-SE": "SEK",
  "no-NO": "NOK",
  "da-DK": "DKK",
  "de-CH": "CHF",
  "fr-CH": "CHF",
  "it-CH": "CHF",
};

export const LANGUAGE_CURRENCY_MAP = {
  en: "USD", // Default to USD for English
  de: "EUR",
  fr: "EUR",
  es: "EUR",
  it: "EUR",
  nl: "EUR",
  ja: "JPY",
  ko: "KRW",
  zh: "CNY",
  hi: "INR",
  pt: "BRL",
  ru: "RUB",
  tr: "TRY",
  pl: "PLN",
  sv: "SEK",
  no: "NOK",
  da: "DKK",
};

export const TIMEZONE_CURRENCY_MAP = {
  // North America
  "America/New_York": "USD",
  "America/Chicago": "USD",
  "America/Denver": "USD",
  "America/Los_Angeles": "USD",
  "America/Phoenix": "USD",
  "America/Anchorage": "USD",
  "America/Detroit": "USD",
  "America/Indiana/Indianapolis": "USD",
  "America/Toronto": "CAD",
  "America/Vancouver": "CAD",
  "America/Montreal": "CAD",
  "America/Halifax": "CAD",
  "America/Winnipeg": "CAD",
  "America/Edmonton": "CAD",
  "America/Mexico_City": "MXN",
  "America/Tijuana": "MXN",
  "America/Cancun": "MXN",

  // Europe
  "Europe/London": "GBP",
  "Europe/Dublin": "EUR",
  "Europe/Edinburgh": "GBP",
  "Europe/Paris": "EUR",
  "Europe/Berlin": "EUR",
  "Europe/Rome": "EUR",
  "Europe/Madrid": "EUR",
  "Europe/Amsterdam": "EUR",
  "Europe/Brussels": "EUR",
  "Europe/Vienna": "EUR",
  "Europe/Zurich": "CHF",
  "Europe/Geneva": "CHF",
  "Europe/Stockholm": "SEK",
  "Europe/Oslo": "NOK",
  "Europe/Copenhagen": "DKK",
  "Europe/Helsinki": "EUR",
  "Europe/Warsaw": "PLN",
  "Europe/Prague": "CZK",
  "Europe/Budapest": "HUF",
  "Europe/Bucharest": "RON",
  "Europe/Sofia": "BGN",
  "Europe/Athens": "EUR",
  "Europe/Istanbul": "TRY",
  "Europe/Moscow": "RUB",
  "Europe/Kiev": "UAH",
  "Europe/Minsk": "BYN",

  // Asia Pacific
  "Asia/Tokyo": "JPY",
  "Asia/Seoul": "KRW",
  "Asia/Shanghai": "CNY",
  "Asia/Hong_Kong": "HKD",
  "Asia/Singapore": "SGD",
  "Asia/Kolkata": "INR",
  "Asia/Mumbai": "INR",
  "Asia/Delhi": "INR",
  "Asia/Bangalore": "INR",
  "Asia/Bangkok": "THB",
  "Asia/Jakarta": "IDR",
  "Asia/Manila": "PHP",
  "Asia/Kuala_Lumpur": "MYR",
  "Asia/Ho_Chi_Minh": "VND",
  "Asia/Taipei": "TWD",
  "Australia/Sydney": "AUD",
  "Australia/Melbourne": "AUD",
  "Australia/Brisbane": "AUD",
  "Australia/Perth": "AUD",
  "Australia/Adelaide": "AUD",
  "Australia/Darwin": "AUD",
  "Pacific/Auckland": "NZD",
  "Pacific/Wellington": "NZD",

  // Middle East & Africa
  "Asia/Dubai": "AED",
  "Asia/Riyadh": "SAR",
  "Asia/Qatar": "QAR",
  "Asia/Kuwait": "KWD",
  "Asia/Bahrain": "BHD",
  "Asia/Tehran": "IRR",
  "Africa/Cairo": "EGP",
  "Africa/Lagos": "NGN",
  "Africa/Johannesburg": "ZAR",
  "Africa/Casablanca": "MAD",
  "Africa/Nairobi": "KES",
  "Africa/Tunis": "TND",

  // South America
  "America/Sao_Paulo": "BRL",
  "America/Rio_Branco": "BRL",
  "America/Manaus": "BRL",
  "America/Argentina/Buenos_Aires": "ARS",
  "America/Santiago": "CLP",
  "America/Bogota": "COP",
  "America/Lima": "PEN",
  "America/Caracas": "VES",
  "America/La_Paz": "BOB",
  "America/Asuncion": "PYG",
  "America/Montevideo": "UYU",
};

export const COUNTRY_CURRENCY_MAP = {
  // Major currencies
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  CH: "CHF",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  SG: "SGD",
  IN: "INR",
  BR: "BRL",
  MX: "MXN",
  RU: "RUB",

  // Eurozone countries
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  FI: "EUR",
  IE: "EUR",
  PT: "EUR",
  GR: "EUR",
  LU: "EUR",
  MT: "EUR",
  CY: "EUR",
  SK: "EUR",
  SI: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",

  // Nordic countries
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  IS: "ISK",

  // Eastern Europe
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  BG: "BGN",
  HR: "HRK",
  RS: "RSD",
  UA: "UAH",
  BY: "BYN",

  // Asia
  TH: "THB",
  ID: "IDR",
  PH: "PHP",
  MY: "MYR",
  VN: "VND",
  TW: "TWD",
  BD: "BDT",
  PK: "PKR",
  LK: "LKR",
  NP: "NPR",

  // Middle East
  AE: "AED",
  SA: "SAR",
  QA: "QAR",
  KW: "KWD",
  BH: "BHD",
  OM: "OMR",
  JO: "JOD",
  LB: "LBP",
  IL: "ILS",
  TR: "TRY",

  // Africa
  ZA: "ZAR",
  EG: "EGP",
  NG: "NGN",
  KE: "KES",
  MA: "MAD",
  TN: "TND",
  DZ: "DZD",
  GH: "GHS",
  UG: "UGX",
  TZ: "TZS",

  // South America
  AR: "ARS",
  CL: "CLP",
  CO: "COP",
  PE: "PEN",
  VE: "VES",
  UY: "UYU",
  PY: "PYG",
  BO: "BOB",
  EC: "USD",
  PA: "USD",
};
