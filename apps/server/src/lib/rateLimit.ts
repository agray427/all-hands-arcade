/**
 * Token bucket, one per socket. With 100+ players in a room a single wedged
 * tab retrying in a loop could otherwise turn into a broadcast storm.
 */
export class RateLimiter {
  #tokens: number;
  #lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.#tokens = capacity;
  }

  tryConsume(now = Date.now()): boolean {
    const elapsedSeconds = Math.max(0, now - this.#lastRefill) / 1000;
    this.#lastRefill = now;
    this.#tokens = Math.min(this.capacity, this.#tokens + elapsedSeconds * this.refillPerSecond);

    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}
