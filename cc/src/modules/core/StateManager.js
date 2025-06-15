import { debug } from "../../constants.js";

/**
 * Central state management for the extension
 * Provides a single source of truth and reactive updates
 */
export class StateManager extends EventTarget {
  constructor() {
    super();
    this.state = {
      settings: {
        baseCurrency: "USD",
        selectedCurrencies: ["USD", "EUR", "GBP", "BTC"],
        favoriteCurrencies: ["USD", "EUR", "GBP", "BTC", "ETH"],
        disabledUrls: [],
        appearance: {},
        extensionEnabled: true,
        btcDenomination: "btc",
      },
      exchangeRates: {},
      lastUpdated: null,
      isLoading: false,
      error: null,
    };

    // Track subscribers for cleanup
    this.subscribers = new Map();
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get specific state value
   */
  get(path) {
    const keys = path.split(".");
    let value = this.state;

    for (const key of keys) {
      value = value?.[key];
    }

    return value;
  }

  /**
   * Update state and notify listeners
   */
  setState(updates, source = "unknown") {
    const oldState = { ...this.state };

    // Deep merge updates
    this.state = this.deepMerge(this.state, updates);

    // Calculate what actually changed
    const changes = this.getChanges(oldState, this.state);

    if (Object.keys(changes).length > 0) {
      debug.log(`State updated from ${source}:`, changes);

      // Emit specific events for each change
      for (const [key, value] of Object.entries(changes)) {
        this.dispatchEvent(
          new CustomEvent(`${key}Changed`, {
            detail: {
              oldValue: this.getDeepValue(oldState, key),
              newValue: value,
              source,
            },
          })
        );
      }

      // Emit general state change event
      this.dispatchEvent(
        new CustomEvent("stateChanged", {
          detail: {
            changes,
            state: this.getState(),
            source,
          },
        })
      );
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback, keys = null) {
    const listener = (event) => {
      callback(event.detail);
    };

    // Store subscription info for cleanup
    const subscription = { callback, listener, keys };
    this.subscribers.set(callback, subscription);

    // Add event listener
    this.addEventListener("stateChanged", listener);

    // Return unsubscribe function
    return () => {
      this.unsubscribe(callback);
    };
  }

  /**
   * Unsubscribe from state changes
   */
  unsubscribe(callback) {
    const subscription = this.subscribers.get(callback);
    if (subscription) {
      this.removeEventListener("stateChanged", subscription.listener);
      this.subscribers.delete(callback);
    }
  }

  /**
   * Subscribe to specific key changes
   */
  subscribeToKey(key, callback) {
    const listener = (event) => {
      callback(event.detail);
    };

    this.addEventListener(`${key}Changed`, listener);

    return () => {
      this.removeEventListener(`${key}Changed`, listener);
    };
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Get changes between two states
   */
  getChanges(oldState, newState, prefix = "") {
    const changes = {};

    // Check all keys in new state
    for (const key in newState) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (
        typeof newState[key] === "object" &&
        !Array.isArray(newState[key]) &&
        newState[key] !== null
      ) {
        // Recursively check nested objects
        const nestedChanges = this.getChanges(
          oldState[key] || {},
          newState[key],
          fullKey
        );
        Object.assign(changes, nestedChanges);
      } else if (
        JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])
      ) {
        changes[fullKey] = newState[key];
      }
    }

    return changes;
  }

  /**
   * Get deep value from object using dot notation
   */
  getDeepValue(obj, path) {
    return path.split(".").reduce((value, key) => value?.[key], obj);
  }

  /**
   * Reset state to defaults
   */
  reset() {
    this.setState(
      {
        settings: {
          baseCurrency: "USD",
          selectedCurrencies: ["USD", "EUR", "GBP", "BTC"],
          favoriteCurrencies: ["USD", "EUR", "GBP", "BTC", "ETH"],
          disabledUrls: [],
          appearance: {},
          extensionEnabled: true,
          btcDenomination: "btc",
        },
        exchangeRates: {},
        lastUpdated: null,
        isLoading: false,
        error: null,
      },
      "reset"
    );
  }

  /**
   * Clean up all subscriptions
   */
  cleanup() {
    // Remove all listeners
    for (const [callback, subscription] of this.subscribers) {
      this.removeEventListener("stateChanged", subscription.listener);
    }
    this.subscribers.clear();
  }
}

// Note: Instance will be created in the module that uses it after bundling
