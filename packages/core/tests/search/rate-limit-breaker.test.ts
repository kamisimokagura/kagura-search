import { describe, it, expect, vi } from "vitest";
import { RateLimitBreaker } from "../../src/search/provider.js";

describe("RateLimitBreaker", () => {
  it("starts open (available)", () => {
    const breaker = new RateLimitBreaker();
    expect(breaker.isOpen).toBe(false);
  });

  it("trips on rate limit", () => {
    const breaker = new RateLimitBreaker();
    breaker.trip();
    expect(breaker.isOpen).toBe(true);
  });

  it("resets after successful request", () => {
    const breaker = new RateLimitBreaker();
    breaker.trip();
    expect(breaker.isOpen).toBe(true);
    breaker.reset();
    expect(breaker.isOpen).toBe(false);
  });

  it("recovers after cooldown expires", () => {
    vi.useFakeTimers();
    const breaker = new RateLimitBreaker();
    breaker.trip(); // 30s cooldown
    expect(breaker.isOpen).toBe(true);
    vi.advanceTimersByTime(31_000);
    expect(breaker.isOpen).toBe(false);
    vi.useRealTimers();
  });

  it("uses exponential backoff on consecutive failures", () => {
    vi.useFakeTimers();
    const breaker = new RateLimitBreaker();

    breaker.trip(); // 1st: 30s
    vi.advanceTimersByTime(31_000);
    expect(breaker.isOpen).toBe(false);

    breaker.trip(); // 2nd: 60s
    vi.advanceTimersByTime(31_000);
    expect(breaker.isOpen).toBe(true); // still in cooldown
    vi.advanceTimersByTime(30_000);
    expect(breaker.isOpen).toBe(false);

    vi.useRealTimers();
  });

  it("caps backoff at 300s", () => {
    vi.useFakeTimers();
    const breaker = new RateLimitBreaker();

    // Trip many times
    for (let i = 0; i < 20; i++) {
      breaker.trip();
      vi.advanceTimersByTime(301_000);
    }

    breaker.trip();
    vi.advanceTimersByTime(301_000);
    expect(breaker.isOpen).toBe(false);

    vi.useRealTimers();
  });
});
