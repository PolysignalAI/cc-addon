import { debug } from "../../constants.js";

/**
 * Reliable message passing system with acknowledgments and retries
 * Works across Chrome and Firefox
 */
export class MessageBus {
  constructor() {
    this.handlers = new Map();
    this.pendingMessages = new Map();
    this.messageId = 0;
    this.setupListener();
  }

  /**
   * Set up the main message listener
   */
  setupListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Handle acknowledgment requests
      if (request._needsAck) {
        this.handleAcknowledgedMessage(request, sender, sendResponse);
        return true; // Keep channel open for async response
      }

      // Handle regular messages
      const handler = this.handlers.get(request.action);
      if (handler) {
        try {
          const result = handler(request, sender);
          if (result instanceof Promise) {
            result
              .then((response) =>
                sendResponse({ success: true, data: response })
              )
              .catch((error) =>
                sendResponse({ success: false, error: error.message })
              );
            return true; // Keep channel open
          } else {
            sendResponse({ success: true, data: result });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      }
    });
  }

  /**
   * Handle messages that need acknowledgment
   */
  handleAcknowledgedMessage(request, sender, sendResponse) {
    const { _messageId, _needsAck, ...payload } = request;

    // Send immediate acknowledgment
    sendResponse({
      acknowledged: true,
      messageId: _messageId,
    });

    // Process the actual message
    const handler = this.handlers.get(payload.action);
    if (handler) {
      try {
        const result = handler(payload, sender);
        if (result instanceof Promise) {
          result.catch((error) => {
            if (typeof debug !== "undefined" && debug.error) {
              debug.error(
                `Error handling acknowledged message ${payload.action}:`,
                error
              );
            }
          });
        }
      } catch (error) {
        if (typeof debug !== "undefined" && debug.error) {
          debug.error(
            `Error handling acknowledged message ${payload.action}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Register a message handler
   */
  on(action, handler) {
    this.handlers.set(action, handler);
    if (typeof debug !== "undefined" && debug.log) {
      debug.log(`Registered handler for action: ${action}`);
    }
  }

  /**
   * Send a reliable message with retries and acknowledgment
   */
  async sendReliable(target, message, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 100,
      timeout = 5000,
      needsAck = true,
    } = options;

    const messageId = ++this.messageId;
    const fullMessage = {
      ...message,
      _messageId: messageId,
      _needsAck: needsAck,
      _timestamp: Date.now(),
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.sendWithTimeout(
          target,
          fullMessage,
          timeout
        );

        if (needsAck && !response?.acknowledged) {
          throw new Error("Message not acknowledged");
        }

        return response;
      } catch (error) {
        if (typeof debug !== "undefined" && debug.warn) {
          debug.warn(`Message send attempt ${attempt + 1} failed:`, error);
        }

        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise((r) =>
            setTimeout(r, retryDelay * Math.pow(2, attempt))
          );
        } else {
          throw new Error(
            `Failed to send message after ${maxRetries} attempts: ${error.message}`
          );
        }
      }
    }
  }

  /**
   * Send message with timeout
   */
  async sendWithTimeout(target, message, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Message timeout"));
      }, timeout);

      try {
        if (target.tabId !== undefined) {
          // Send to specific tab
          chrome.tabs.sendMessage(target.tabId, message, (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        } else if (target === "background") {
          // Send to background
          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        } else {
          clearTimeout(timeoutId);
          reject(new Error("Invalid target"));
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Broadcast message to all tabs
   */
  async broadcast(message, options = {}) {
    const tabs = await chrome.tabs.query({});
    const results = [];

    for (const tab of tabs) {
      if (tab.id) {
        try {
          const response = await this.sendReliable(
            { tabId: tab.id },
            message,
            { ...options, maxRetries: 1 } // Don't retry too much for broadcasts
          );
          results.push({ tabId: tab.id, success: true, response });
        } catch (error) {
          results.push({ tabId: tab.id, success: false, error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Send to active tab
   */
  async sendToActiveTab(message, options = {}) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      throw new Error("No active tab found");
    }

    return this.sendReliable({ tabId: tab.id }, message, options);
  }

  /**
   * Clean up
   */
  cleanup() {
    this.handlers.clear();
    this.pendingMessages.clear();
  }
}

// Note: Instance will be created in the module that uses it after bundling
