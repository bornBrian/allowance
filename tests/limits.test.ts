import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LimitReached } from "@/lib/errors";
import { countChannel3Call, limit } from "@/lib/limits";

// Uses a fresh in-memory database (see vitest.config.mts) and a fixed clock.
// Each test uses its own wallet and IP so counts don't carry over.
let n = 0;
const fresh = () => ({ wallet: `w${++n}`, ip: `10.0.0.${n}` });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T10:00:05Z"));
});
afterEach(() => vi.useRealTimers());

describe("limit", () => {
  it("allows up to the limit, then refuses with how long to wait", () => {
    const who = fresh();
    for (let i = 0; i < 3; i++) limit("ask", who); // 3 asks a minute
    try {
      limit("ask", who);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LimitReached);
      expect((err as LimitReached).status).toBe(429);
      expect((err as LimitReached).retryAfterSeconds).toBe(55);
    }
  });

  it("allows again once the window has passed", () => {
    const who = fresh();
    for (let i = 0; i < 3; i++) limit("ask", who);
    vi.setSystemTime(new Date("2026-11-04T10:01:00Z"));
    expect(() => limit("ask", who)).not.toThrow();
  });

  it("counts wallets separately", () => {
    const a = fresh();
    for (let i = 0; i < 3; i++) limit("ask", a);
    expect(() => limit("ask", { ...fresh(), ip: a.ip })).not.toThrow();
  });

  it("still limits by IP when someone keeps starting new wallets", () => {
    const ip = fresh().ip;
    for (let i = 0; i < 20; i++) limit("newWallet", { ip });
    expect(() => limit("newWallet", { ip })).toThrow(LimitReached);
  });

  it("has a daily cap on top of the per-minute one", () => {
    const who = fresh();
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 4, 1, i)));
      limit("ask", { ...who, ip: `ip-${i}` });
    }
    vi.setSystemTime(new Date("2026-11-04T23:00:00Z"));
    expect(() => limit("ask", { ...who, ip: "ip-new" })).toThrow(/today's limit/);
  });
});

describe("countChannel3Call", () => {
  it("stops before the monthly allowance runs out", () => {
    vi.stubEnv("CHANNEL3_MONTHLY_LIMIT", "2");
    countChannel3Call();
    countChannel3Call();
    expect(() => countChannel3Call()).toThrow(LimitReached);
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    expect(() => countChannel3Call()).not.toThrow();
    vi.unstubAllEnvs();
  });
});
