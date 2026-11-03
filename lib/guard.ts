import type { Period, Rules } from "./rules";

// The guard is plain code, not AI. Every purchase the agent proposes passes
// through decide() before any money moves. Claude can suggest; only this file
// can say yes. Nothing a product page says can change what it returns.

export type Verdict = "pay" | "ask" | "block";

export interface Proposal {
  productId: string;
  title: string;
  priceCents: number;
  currency: string;
  shop: string; // the shop's domain, e.g. target.com
  url: string;
  category: string; // taken from the person's request, never from product data
}

// A second look at the product, taken just before paying.
export interface Checkout {
  priceCents: number | null; // null when the shop couldn't be reached
  currency: string | null;
  inStock: boolean | null;
}

export interface PastPurchase {
  productId: string;
  category: string;
  shop: string;
  amountCents: number;
  at: Date;
}

export interface Check {
  label: string;
  outcome: "ok" | "ask" | "block";
  detail: string;
}

export interface Decision {
  verdict: Verdict;
  amountCents: number; // what would be charged
  checks: Check[];
  reasons: string[]; // the details of every check that didn't pass
}

export interface GuardInput {
  proposal: Proposal;
  checkout: Checkout;
  rules: Rules;
  history: PastPurchase[]; // paid purchases only
  now: Date;
}

const SUBSCRIPTION_WORDS = /subscri|membership|auto-?renew|monthly plan|annual plan|per month|\/mo\b/i;
const REPEAT_WINDOW_DAYS = 7;

export function decide({ proposal, checkout, rules, history, now }: GuardInput): Decision {
  const checks: Check[] = [];
  const add = (label: string, outcome: Check["outcome"], detail: string) =>
    checks.push({ label, outcome, detail });

  const category = norm(proposal.category);
  const shop = normShop(proposal.shop);
  const rule = rules.categories.find((c) => norm(c.name) === category);

  // The amount is the agreed price, or the checkout price if it came down.
  let amount = proposal.priceCents;
  if (checkout.priceCents !== null && checkout.priceCents < amount) amount = checkout.priceCents;

  // 1. The price has to be a real amount in dollars.
  if (!Number.isInteger(proposal.priceCents) || proposal.priceCents <= 0) {
    add("Price", "block", "The product has no usable price.");
  } else if (proposal.currency.toUpperCase() !== "USD") {
    add("Price", "block", `The price is in ${proposal.currency}, and the allowance is in US dollars.`);
  } else {
    add("Price", "ok", `${money(proposal.priceCents)}.`);
  }

  // 2. The link has to go to the shop it claims to be from.
  const host = hostOf(proposal.url);
  if (!host || !proposal.url.startsWith("https://") || !(host === shop || host.endsWith("." + shop))) {
    add("Shop link", "block", `The link doesn't lead to ${shop}.`);
  } else {
    add("Shop link", "ok", `Goes to ${shop}.`);
  }

  // 3. Things the person never wants bought.
  const banned = rules.neverBuy.map(norm).find((word) => {
    if (word === category) return true;
    if (word.startsWith("subscription")) return SUBSCRIPTION_WORDS.test(proposal.title);
    return word.length > 2 && norm(proposal.title).includes(word);
  });
  if (banned) {
    add("Never buy", "block", `Your rules say never buy ${banned}.`);
  } else if (rules.neverBuy.length) {
    add("Never buy", "ok", `Not on your never-buy list.`);
  }

  // 4. Look again at checkout: the price and stock must still hold.
  if (checkout.priceCents === null) {
    add("Checkout price", "ask", "The shop's current price couldn't be confirmed.");
  } else if (checkout.currency && checkout.currency.toUpperCase() !== proposal.currency.toUpperCase()) {
    add("Checkout price", "block", `The currency changed at checkout to ${checkout.currency}.`);
  } else if (checkout.priceCents > proposal.priceCents) {
    add(
      "Checkout price",
      "block",
      `The price went up at checkout, from ${money(proposal.priceCents)} to ${money(checkout.priceCents)}.`,
    );
  } else {
    add("Checkout price", "ok", `Still ${money(checkout.priceCents)}.`);
  }
  if (checkout.inStock === false) add("Stock", "block", "Out of stock at checkout.");

  // 5. Per-purchase limit.
  const itemCap = rule?.maxItemPrice ?? rules.maxItemPrice;
  if (itemCap !== null && itemCap !== undefined) {
    const cap = cents(itemCap);
    if (amount > cap) {
      add("Item limit", "ask", `${money(amount)} is over your ${money(cap)} limit for ${rule ? category : "one purchase"}.`);
    } else {
      add("Item limit", "ok", `Within your ${money(cap)} limit for ${rule ? category : "one purchase"}.`);
    }
  } else if (!rule) {
    add("Item limit", "ask", `None of your rules cover ${category}.`);
  }

  // 6. Category budget for this week or month.
  if (rule?.budget !== null && rule?.budget !== undefined) {
    const period = rule.period ?? "week";
    const spent = spentSince(history, periodStart(period, now), (p) => norm(p.category) === category);
    const budget = cents(rule.budget);
    const left = Math.max(0, budget - spent);
    if (amount > left) {
      add("Budget", "ask", `Only ${money(left)} left of ${money(budget)} for ${category} this ${period}.`);
    } else {
      add("Budget", "ok", `${money(left - amount)} of ${money(budget)} left for ${category} this ${period} after this.`);
    }
  }

  // 7. Overall budget.
  if (rules.overallBudget !== null) {
    const period = rules.overallPeriod ?? "month";
    const spent = spentSince(history, periodStart(period, now), () => true);
    const budget = cents(rules.overallBudget);
    const left = Math.max(0, budget - spent);
    if (amount > left) {
      add("Overall budget", "ask", `Only ${money(left)} left of ${money(budget)} in total this ${period}.`);
    } else {
      add("Overall budget", "ok", `${money(left - amount)} of ${money(budget)} left this ${period} after this.`);
    }
  }

  // 8. Shops the agent hasn't used before.
  const trusted = rules.trustedShops.map(normShop).includes(shop);
  const usedBefore = history.some((p) => normShop(p.shop) === shop);
  if (rules.askBeforeNewShop && !trusted && !usedBefore) {
    add("Shop", "ask", `First purchase from ${shop}.`);
  } else {
    add("Shop", "ok", trusted ? `${shop} is on your trusted list.` : usedBefore ? `Used ${shop} before.` : `${shop}.`);
  }

  // 9. The same product bought again soon after.
  const since = new Date(now.getTime() - REPEAT_WINDOW_DAYS * 86_400_000);
  if (history.some((p) => p.productId === proposal.productId && p.at >= since)) {
    add("Repeat", "ask", `Already bought this in the last ${REPEAT_WINDOW_DAYS} days.`);
  }

  const verdict: Verdict = checks.some((c) => c.outcome === "block")
    ? "block"
    : checks.some((c) => c.outcome === "ask")
      ? "ask"
      : "pay";
  const reasons = checks.filter((c) => c.outcome !== "ok").map((c) => c.detail);
  return { verdict, amountCents: amount, checks, reasons };
}

// Weeks start on Monday, months on the 1st, both at midnight UTC.
export function periodStart(period: Period, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "month") {
    d.setUTCDate(1);
  } else {
    const sinceMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - sinceMonday);
  }
  return d;
}

export function spentSince(history: PastPurchase[], start: Date, match: (p: PastPurchase) => boolean): number {
  return history.filter((p) => p.at >= start && match(p)).reduce((sum, p) => sum + p.amountCents, 0);
}

export function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function money(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

export function normShop(shop: string): string {
  return shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function hostOf(url: string): string | null {
  try {
    return normShop(new URL(url).hostname);
  } catch {
    return null;
  }
}
