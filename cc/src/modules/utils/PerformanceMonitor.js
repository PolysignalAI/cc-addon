import { debug } from "../../constants.js";

/**
 * Performance monitoring utility
 * Tracks execution times and memory usage
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.enabled = true;
  }

  /**
   * Start timing an operation
   */
  start(operation) {
    if (!this.enabled) return;

    this.metrics.set(operation, {
      startTime: performance.now(),
      startMemory: this.getMemoryUsage(),
    });
  }

  /**
   * End timing and log results
   */
  end(operation) {
    if (!this.enabled) return;

    const metric = this.metrics.get(operation);
    if (!metric) return;

    const duration = performance.now() - metric.startTime;
    const memoryDelta = this.getMemoryUsage() - metric.startMemory;

    debug.log(
      `Performance: ${operation} took ${duration.toFixed(2)}ms, memory delta: ${this.formatBytes(memoryDelta)}`
    );

    this.metrics.delete(operation);

    return { duration, memoryDelta };
  }

  /**
   * Measure async operation
   */
  async measure(operation, fn) {
    this.start(operation);
    try {
      const result = await fn();
      return result;
    } finally {
      this.end(operation);
    }
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Log all current metrics
   */
  logMetrics() {
    debug.log(
      "Current performance metrics:",
      Array.from(this.metrics.entries())
    );
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }
}
