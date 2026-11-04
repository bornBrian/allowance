import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addPurchase, getWallet, saveRules } from "@/lib/db";
import type { Rules } from "@/lib/rules";
import { appState } from "@/lib/state";

const rules: Rules = {
  categories: [
    { name: "home", budget: 60, period: "week", maxItemPrice: null },
    { name: "gifts", budget: null, period: null, maxItemPrice: 40 },
  ],
  overallBudget: null,
  overallPeriod: null,
  maxItemPrice: null,
  askBeforeNewShop: false,
  neverBuy: [],
  trustedShops: [],
};

function paid(walletId: string, category: string, amountCents: number) {
  addPurchase({
    id: randomUUID(),
    walletId,
    request: "something",
    productId: randomUUID(),
    title: "A thing",
    image: null,
    shop: "example.com",
    url: "https://example.com/thing",
    category,
    amountCents,
    status: "paid",
    why: "Fits.",
    checks: [],
    memberId: null,
  });
}

describe("what the page shows about budgets", () => {
  it("takes paid purchases off their budget, and shows spending no budget counts", () => {
    const walletId = getWallet(randomUUID()).id;
    saveRules(walletId, "$60 a week for the home. Gifts up to $40 each.", rules);
    paid(walletId, "home", 2199);
    paid(walletId, "clothing", 4497);
    paid(walletId, "gifts", 3000);

    const state = appState({ role: "payer", wallet: getWallet(walletId) });
    expect(state.remaining).toEqual([{ label: "Home", period: "week", budgetCents: 6000, spentCents: 2199 }]);
    expect(state.outsideBudgetsCents).toBe(7497);
  });
});
