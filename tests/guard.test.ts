import { describe, expect, it } from "vitest";
import { decide, periodStart, type Checkout, type PastPurchase, type Proposal } from "@/lib/guard";
import type { Rules } from "@/lib/rules";

const rules: Rules = {
  categories: [
    { name: "groceries", budget: 60, period: "week", maxItemPrice: null },
    { name: "gifts", budget: null, period: null, maxItemPrice: 40 },
  ],
  overallBudget: null,
  overallPeriod: null,
  maxItemPrice: null,
  askBeforeNewShop: true,
  neverBuy: ["subscriptions"],
  trustedShops: ["target.com"],
};

// Wednesday 5 Nov 2026
const now = new Date("2026-11-05T12:00:00Z");

const gift: Proposal = {
  productId: "p1",
  title: "Hand trowel and fork set",
  priceCents: 3200,
  currency: "USD",
  shop: "target.com",
  url: "https://www.target.com/p/trowel-set/-/A-1",
  category: "gifts",
};

const sameAtCheckout: Checkout = { priceCents: 3200, currency: "USD", inStock: true };

function run(proposal: Partial<Proposal> = {}, checkout: Partial<Checkout> = {}, history: PastPurchase[] = []) {
  return decide({
    proposal: { ...gift, ...proposal },
    checkout: { ...sameAtCheckout, ...checkout },
    rules,
    history,
    now,
  });
}

describe("decide", () => {
  it("pays for a gift within the limit from a trusted shop", () => {
    const d = run();
    expect(d.verdict).toBe("pay");
    expect(d.amountCents).toBe(3200);
    expect(d.reasons).toEqual([]);
  });

  it("asks when a gift is over the per-item limit", () => {
    const d = run({ priceCents: 5500 }, { priceCents: 5500 });
    expect(d.verdict).toBe("ask");
    expect(d.reasons).toContain("$55.00 is over your $40.00 limit for gifts.");
  });

  it("blocks when the price goes up at checkout", () => {
    const d = run({}, { priceCents: 3900 });
    expect(d.verdict).toBe("block");
    expect(d.reasons[0]).toMatch(/went up at checkout, from \$32.00 to \$39.00/);
  });

  it("charges the lower price when it drops at checkout", () => {
    expect(run({}, { priceCents: 2900 }).amountCents).toBe(2900);
  });

  it("blocks when out of stock", () => {
    expect(run({}, { inStock: false }).verdict).toBe("block");
  });

  it("asks when the price can't be confirmed", () => {
    expect(run({}, { priceCents: null, currency: null, inStock: null }).verdict).toBe("ask");
  });

  it("blocks subscriptions", () => {
    const d = run({ title: "Seed of the Month subscription box" });
    expect(d.verdict).toBe("block");
    expect(d.reasons).toContain("Your rules say never buy subscriptions.");
  });

  it("blocks a link that goes somewhere other than the shop", () => {
    expect(run({ url: "https://target.com.evil.example/p/1" }).verdict).toBe("block");
    expect(run({ url: "http://www.target.com/p/1" }).verdict).toBe("block");
  });

  it("asks before a shop that hasn't been used and isn't trusted", () => {
    const d = run({ shop: "gardeners.com", url: "https://www.gardeners.com/trowel" });
    expect(d.verdict).toBe("ask");
    expect(d.reasons).toContain("First purchase from gardeners.com.");
  });

  it("doesn't ask about a shop used before", () => {
    const history: PastPurchase[] = [
      { productId: "x", category: "gifts", shop: "gardeners.com", amountCents: 1000, at: new Date("2026-10-01") },
    ];
    expect(run({ shop: "gardeners.com", url: "https://www.gardeners.com/trowel" }, {}, history).verdict).toBe("pay");
  });

  it("asks when the weekly groceries budget would be passed", () => {
    const history: PastPurchase[] = [
      { productId: "a", category: "groceries", shop: "target.com", amountCents: 4500, at: new Date("2026-11-03T09:00:00Z") },
    ];
    const d = run({ category: "groceries", priceCents: 2000 }, { priceCents: 2000 }, history);
    expect(d.verdict).toBe("ask");
    expect(d.reasons).toContain("Only $15.00 left of $60.00 for groceries this week.");
  });

  it("ignores spending from last week", () => {
    const history: PastPurchase[] = [
      { productId: "a", category: "groceries", shop: "target.com", amountCents: 5500, at: new Date("2026-11-01T09:00:00Z") },
    ];
    expect(run({ category: "groceries", priceCents: 2000 }, { priceCents: 2000 }, history).verdict).toBe("pay");
  });

  it("asks when no rule covers the category", () => {
    const d = run({ category: "electronics" });
    expect(d.verdict).toBe("ask");
    expect(d.reasons).toContain("None of your rules cover electronics.");
  });

  it("asks before buying the same thing twice in a week", () => {
    const history: PastPurchase[] = [
      { productId: "p1", category: "gifts", shop: "target.com", amountCents: 3200, at: new Date("2026-11-04") },
    ];
    expect(run({}, {}, history).verdict).toBe("ask");
  });

  it("blocks non-dollar prices", () => {
    expect(run({ currency: "EUR" }, { currency: "EUR" }).verdict).toBe("block");
  });
});

describe("periodStart", () => {
  it("starts weeks on Monday", () => {
    expect(periodStart("week", now).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(periodStart("week", new Date("2026-11-02T00:00:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(periodStart("week", new Date("2026-11-08T23:59:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("starts months on the 1st", () => {
    expect(periodStart("month", now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
