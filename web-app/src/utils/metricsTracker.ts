/**
 * Message Metrics Tracker
 * Tracks real-time metrics during message generation:
 * - Tokens per second
 * - Time to first token
 * - Total tokens
 * - Generation time
 */

export interface MessageMetrics {
  model: string;
  startTime: number;
  firstTokenTime?: number;
  totalTokens: number;
  totalCost: number;
  generationTime?: number;
}

export class MetricsTracker {
  private metrics: MessageMetrics;
  private startTime: number;
  private tokenCount: number = 0;
  private firstTokenReceived: boolean = false;

  constructor(model: string) {
    this.startTime = Date.now();
    this.metrics = {
      model,
      startTime: this.startTime,
      totalTokens: 0,
      totalCost: 0,
    };
  }

  /**
   * Record the first token received
   */
  recordFirstToken(): void {
    if (!this.firstTokenReceived) {
      this.firstTokenReceived = true;
      this.metrics.firstTokenTime = Date.now();
    }
  }

  /**
   * Record token count
   */
  recordTokens(count: number): void {
    this.tokenCount += count;
    this.metrics.totalTokens = this.tokenCount;
  }

  /**
   * Record cost (if known)
   */
  recordCost(cost: number): void {
    this.metrics.totalCost = cost;
  }

  /**
   * Mark generation as complete
   */
  complete(): void {
    this.metrics.generationTime = Date.now() - this.startTime;
  }

  /**
   * Get time to first token in milliseconds
   */
  getTimeToFirstToken(): number | undefined {
    if (this.metrics.firstTokenTime) {
      return this.metrics.firstTokenTime - this.startTime;
    }
    return undefined;
  }

  /**
   * Get tokens per second
   */
  getTokensPerSecond(): number {
    if (!this.metrics.generationTime || this.metrics.generationTime === 0) {
      return 0;
    }
    return (this.tokenCount / this.metrics.generationTime) * 1000;
  }

  /**
   * Get all metrics
   */
  getMetrics(): MessageMetrics {
    const metrics = { ...this.metrics };
    if (metrics.firstTokenTime && metrics.startTime) {
      metrics.totalTokens = this.tokenCount;
    }
    return metrics;
  }

  /**
   * Format metrics for display
   */
  getFormattedMetrics(): {
    model: string;
    ttft?: string; // Time to first token
    tokensPerSecond?: string;
    totalTokens: number;
    totalCost: string;
    generationTime?: string;
  } {
    const ttft = this.getTimeToFirstToken();
    const tps = this.getTokensPerSecond();
    const generationTime = this.metrics.generationTime;

    return {
      model: this.metrics.model,
      ttft: ttft ? `${ttft.toFixed(0)}ms` : undefined,
      tokensPerSecond: tps > 0 ? `${tps.toFixed(1)} tok/s` : undefined,
      totalTokens: this.metrics.totalTokens,
      totalCost: `$${this.metrics.totalCost.toFixed(4)}`,
      generationTime:
        generationTime && generationTime > 0
          ? `${(generationTime / 1000).toFixed(2)}s`
          : undefined,
    };
  }
}

/**
 * Helper function to calculate cost based on tokens and model pricing
 * This is a simplified version - actual implementation would use model pricing data
 */
export function estimateCost(totalTokens: number, model: string): number {
  // Placeholder implementation - should use actual model pricing
  // Cost = (prompt_tokens * prompt_price + completion_tokens * completion_price)
  const baseCostPerToken = 0.000001; // Very rough estimate
  return totalTokens * baseCostPerToken;
}

/**
 * Format milliseconds to human-readable string
 */
export function formatMilliseconds(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format tokens with appropriate unit
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  }
  return `${(tokens / 1000).toFixed(1)}k tokens`;
}
