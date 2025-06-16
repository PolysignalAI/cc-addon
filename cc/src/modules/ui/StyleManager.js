import { debug } from "../../constants.js";

/**
 * Manages dynamic style injection and appearance settings
 * Replaces the massive style methods from PriceConverter
 */
export class StyleManager {
  constructor() {
    this.styleElement = null;
    this.appearance = null;
  }

  /**
   * Initialize styles with appearance settings
   */
  init(appearance) {
    this.appearance = appearance;
    this.injectStyles();
  }

  /**
   * Inject dynamic styles
   */
  injectStyles() {
    // Remove existing styles
    if (this.styleElement) {
      this.styleElement.remove();
    }

    // Create new style element
    this.styleElement = document.createElement("style");
    this.styleElement.id = "currency-converter-styles";
    this.styleElement.textContent = this.generateStyles();

    // Add to document
    if (document.head) {
      document.head.appendChild(this.styleElement);
    } else {
      // Fallback for cases where head isn't ready
      document.addEventListener("DOMContentLoaded", () => {
        document.head.appendChild(this.styleElement);
      });
    }

    // Ensure our styles have priority
    this.ensureStylePriority();
  }

  /**
   * Generate CSS based on appearance settings
   */
  generateStyles() {
    const {
      highlightStyle,
      borderColor,
      borderHoverColor,
      backgroundColor,
      backgroundHoverColor,
      borderThickness,
      borderRadius,
      borderStyle,
      backgroundOpacity,
      tooltipTheme,
      paddingVertical = 2,
      paddingHorizontal = 4,
    } = this.appearance;

    const bgColorRgba = this.hexToRgba(
      backgroundColor,
      backgroundOpacity / 100
    );
    const bgHoverColorRgba = this.hexToRgba(
      backgroundHoverColor,
      (backgroundOpacity + 10) / 100
    );

    // Set CSS custom properties on the document root
    this.setCSSVariables();

    return `
      /* Base styles for all highlight types */
      .price-wrapper {
        display: inline;
        position: relative;
        transition: all 0.2s ease;
        cursor: pointer;
      }

      /* Underline style */
      .cc-style-underline {
        position: relative;
        text-decoration: none !important;
        border-radius: ${borderRadius}px;
        /* Use padding with negative margins to prevent layout shift */
        padding: ${paddingVertical}px ${paddingHorizontal}px;
        margin: -${paddingVertical}px -${paddingHorizontal}px;
        overflow: hidden; /* Ensure underline doesn't extend past rounded corners */
      }

      .cc-style-underline::after {
        content: '';
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        height: ${borderThickness}px;
        background: ${borderColor};
        transition: background 0.3s ease;
      }

      .cc-style-underline:hover::after {
        background: ${borderHoverColor};
      }

      /* Border style */
      .cc-style-border {
        border: ${borderThickness}px ${borderStyle} ${borderColor};
        border-radius: ${borderRadius}px;
        padding: ${paddingVertical}px ${paddingHorizontal}px;
        transition: all 0.2s ease;
      }

      .cc-style-border:hover {
        border-color: ${borderHoverColor};
        transform: translateY(-1px);
      }

      /* Background style */
      .cc-style-background {
        background-color: ${bgColorRgba};
        border-radius: ${borderRadius}px;
        padding: ${paddingVertical}px ${paddingHorizontal}px;
        transition: all 0.2s ease;
      }

      .cc-style-background:hover {
        background-color: ${bgHoverColorRgba};
        transform: translateY(-1px);
      }

      /* Tooltip styles */
      .currency-tooltip {
        position: absolute;
        background: ${tooltipTheme === "dark" ? "#1a1a1a" : "#ffffff"};
        color: ${tooltipTheme === "dark" ? "#ffffff" : "#1a1a1a"};
        border: 1px solid ${tooltipTheme === "dark" ? "#333" : "#ddd"};
        border-radius: 8px;
        padding: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, ${tooltipTheme === "dark" ? "0.3" : "0.1"});
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        z-index: 2147483647;
        pointer-events: auto;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s, visibility 0.2s;
        max-width: 250px;
        line-height: 1.4;
      }

      .currency-tooltip-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .currency-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 0;
      }

      .currency-item.base-currency {
        font-weight: 600;
        border-bottom: 1px solid ${tooltipTheme === "dark" ? "#444" : "#eee"};
        padding-bottom: 4px;
        margin-bottom: 2px;
      }

      .currency-code {
        color: ${tooltipTheme === "dark" ? "#888" : "#666"};
        font-size: 11px;
        text-transform: uppercase;
        margin-right: 8px;
      }

      .currency-amount {
        font-weight: 500;
        white-space: nowrap;
      }

      /* Portal container */
      #currency-converter-portal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 0;
        pointer-events: none;
        z-index: 2147483647;
      }

      /* Error warning styles */
      .cc-error-warning {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 12px 16px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 2147483647;
        animation: slideIn 0.3s ease;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      /* Responsive adjustments */
      @media (max-width: 600px) {
        .currency-tooltip {
          font-size: 12px;
          padding: 6px;
        }
      }
    `;
  }

  /**
   * Update styles when appearance changes
   */
  updateStyles(appearance) {
    this.appearance = appearance;
    this.injectStyles();
    // Ensure CSS variables are updated as well
    this.setCSSVariables();
  }

  /**
   * Apply appearance to element
   */
  applyToElement(element, style = null) {
    if (!element) return;

    const highlightStyle = style || this.appearance.highlightStyle;

    // Remove existing style classes
    element.classList.remove(
      "cc-style-underline",
      "cc-style-border",
      "cc-style-background"
    );

    // Add new style class
    element.classList.add(`cc-style-${highlightStyle}`);

    // Add base wrapper class
    element.classList.add("price-wrapper");
  }

  /**
   * Apply inline styles for special cases
   */
  applyInlineStyles(element, styles) {
    if (!element || !styles) return;

    for (const [property, value] of Object.entries(styles)) {
      element.style[property] = value;
    }
  }

  /**
   * Ensure our styles have priority
   */
  ensureStylePriority() {
    if (!this.styleElement) return;

    // Move our style element to the end of head
    const parent = this.styleElement.parentNode;
    if (parent && parent.lastElementChild !== this.styleElement) {
      parent.appendChild(this.styleElement);
    }

    // Monitor for new style additions
    if (!this.styleObserver) {
      this.styleObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            // Check if new styles were added after ours
            const ourIndex = Array.from(document.head.children).indexOf(
              this.styleElement
            );
            const lastIndex = document.head.children.length - 1;

            if (ourIndex < lastIndex && ourIndex !== -1) {
              // Move our styles to the end again
              document.head.appendChild(this.styleElement);
            }
          }
        }
      });

      this.styleObserver.observe(document.head, {
        childList: true,
        subtree: false,
      });
    }
  }

  /**
   * Set CSS custom properties on document root
   */
  setCSSVariables() {
    if (!this.appearance) return;

    const {
      borderColor,
      borderHoverColor,
      backgroundColor,
      backgroundHoverColor,
      borderThickness,
      borderRadius,
      borderStyle,
      backgroundOpacity,
    } = this.appearance;

    const bgColorRgba = this.hexToRgba(
      backgroundColor,
      backgroundOpacity / 100
    );
    const bgHoverColorRgba = this.hexToRgba(
      backgroundHoverColor,
      (backgroundOpacity + 10) / 100
    );

    const root = document.documentElement;

    // Set all cc- prefixed CSS variables
    root.style.setProperty("--cc-border-color", borderColor);
    root.style.setProperty("--cc-border-hover-color", borderHoverColor);
    root.style.setProperty("--cc-background-color", backgroundColor);
    root.style.setProperty("--cc-background-hover-color", backgroundHoverColor);
    root.style.setProperty("--cc-border-thickness", `${borderThickness}px`);
    root.style.setProperty("--cc-border-radius", `${borderRadius || 0}px`);
    root.style.setProperty("--cc-border-style", borderStyle);
    root.style.setProperty("--cc-background-color-rgba", bgColorRgba);
    root.style.setProperty(
      "--cc-background-hover-color-rgba",
      bgHoverColorRgba
    );

    // Set tooltip theme variables
    const tooltipTheme = this.appearance.tooltipTheme || "dark";
    root.style.setProperty("--cc-tooltip-theme", tooltipTheme);
    root.style.setProperty(
      "--cc-tooltip-bg",
      tooltipTheme === "dark" ? "rgba(0, 0, 0, 0.95)" : "rgba(255, 255, 255, 1)" // No transparency for light mode
    );
    root.style.setProperty(
      "--cc-tooltip-color",
      tooltipTheme === "dark" ? "#ffffff" : "#1a1a1a"
    );
    root.style.setProperty(
      "--cc-tooltip-border",
      tooltipTheme === "dark" ? "rgba(255, 255, 255, 0.1)" : "#ddd"
    );
    root.style.setProperty(
      "--cc-tooltip-shadow",
      tooltipTheme === "dark"
        ? "0 4px 20px rgba(0, 0, 0, 0.4)"
        : "0 4px 12px rgba(0, 0, 0, 0.1)"
    );
    root.style.setProperty(
      "--cc-tooltip-code-color",
      tooltipTheme === "dark" ? "rgba(255, 255, 255, 0.6)" : "#666"
    );
    root.style.setProperty(
      "--cc-tooltip-base-color",
      tooltipTheme === "dark" ? "#ffffff" : "#000000"
    );
    root.style.setProperty(
      "--cc-tooltip-amount-color",
      tooltipTheme === "dark" ? "#ffffff" : "#000000"
    );
    root.style.setProperty(
      "--cc-tooltip-divider",
      tooltipTheme === "dark" ? "rgba(255, 255, 255, 0.15)" : "#eee"
    );
    root.style.setProperty(
      "--cc-tooltip-font-size",
      `${this.appearance.tooltipFontSize || 13}px`
    );

    debug.log("CSS variables set on document root:", {
      borderColor,
      borderHoverColor,
      backgroundColor,
      backgroundHoverColor,
      borderThickness,
      borderRadius,
      borderStyle,
      bgColorRgba,
      bgHoverColorRgba,
      tooltipTheme,
    });
  }

  /**
   * Convert hex color to rgba
   */
  hexToRgba(hex, alpha) {
    // Remove # if present
    hex = hex.replace("#", "");

    // Parse hex values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Clean up styles
   */
  cleanup() {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    if (this.styleObserver) {
      this.styleObserver.disconnect();
      this.styleObserver = null;
    }
  }

  /**
   * Get current appearance settings
   */
  getAppearance() {
    return this.appearance;
  }
}
