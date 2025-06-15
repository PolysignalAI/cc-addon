import { debug } from "../../constants.js";

// Ensure chrome API is available (Firefox compatibility)
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  window.chrome = browser;
}

/**
 * Handles communication between content script, popup, and background
 */
export class MessageHandler {
  constructor() {
    this.handlers = new Map();
    this.listenerSetup = false;
    this.setupListener();
  }

  /**
   * Register a message handler
   */
  on(action, handler) {
    if (!this.handlers.has(action)) {
      this.handlers.set(action, new Set());
    }
    this.handlers.get(action).add(handler);
  }

  /**
   * Unregister a message handler
   */
  off(action, handler) {
    if (this.handlers.has(action)) {
      this.handlers.get(action).delete(handler);
    }
  }

  /**
   * Send message to background script
   */
  async sendToBackground(action, data = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Set up message listener
   */
  setupListener() {
    // Prevent duplicate listeners
    if (this.listenerSetup) {
      return;
    }

    this.listenerSetup = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Handle async responses
      let isAsync = false;
      const asyncResponse = (response) => {
        isAsync = true;
        sendResponse(response);
      };

      // Find and execute handlers
      if (request.action && this.handlers.has(request.action)) {
        const handlers = this.handlers.get(request.action);

        for (const handler of handlers) {
          try {
            const result = handler(request, asyncResponse);

            // If handler returns a promise, wait for it
            if (result instanceof Promise) {
              isAsync = true;
              result
                .then((response) => sendResponse(response))
                .catch((error) => {
                  debug.error("Handler error:", error);
                  sendResponse({ error: error.message });
                });
            }
          } catch (error) {
            debug.error("Handler error:", error);
            sendResponse({ error: error.message });
          }
        }
      }

      // Return true if async to keep the message channel open
      return isAsync;
    });
  }

  /**
   * Common message handlers
   */

  /**
   * Request exchange rates from background
   */
  async requestExchangeRates() {
    try {
      const response = await this.sendToBackground("getRates");
      return response;
    } catch (error) {
      debug.error("Failed to get exchange rates:", error);
      throw error;
    }
  }

  /**
   * Report an error to background
   */
  async reportError(error, context = {}) {
    try {
      await this.sendToBackground("reportError", {
        error: error.message || error,
        stack: error.stack,
        context,
        url: window.location.href,
        timestamp: Date.now(),
      });
    } catch (e) {
      debug.error("Failed to report error:", e);
    }
  }

  /**
   * Check if extension is active on current tab
   */
  async checkActive() {
    try {
      const response = await this.sendToBackground("checkActive", {
        url: window.location.href,
      });
      return response.active;
    } catch (error) {
      debug.error("Failed to check active status:", error);
      return false;
    }
  }

  /**
   * Get settings from background
   */
  async getSettings() {
    try {
      const response = await this.sendToBackground("getSettings");
      return response.settings;
    } catch (error) {
      debug.error("Failed to get settings:", error);
      throw error;
    }
  }

  /**
   * Update settings via background
   */
  async updateSettings(updates) {
    try {
      await this.sendToBackground("updateSettings", { updates });
    } catch (error) {
      debug.error("Failed to update settings:", error);
      throw error;
    }
  }

  /**
   * Track conversion event
   */
  async trackConversion(data) {
    try {
      await this.sendToBackground("trackConversion", data);
    } catch (error) {
      debug.error("Failed to track conversion:", error);
    }
  }

  /**
   * Clean up handlers
   */
  cleanup() {
    this.handlers.clear();
  }
}
