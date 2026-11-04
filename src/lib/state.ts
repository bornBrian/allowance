import "server-only";
import { listPurchases, paidHistory, type Purchase, type Wallet } from "./db";
import { describeRules } from "./describe";
import { cents, periodStart, spentSince } from "./guard";
import { captchaSiteKey } from "./captcha";
import { paypalClientId } from "./paypal";

export interface Remaining {
  label: string;
  period: string;
  budgetCents: number;
  spentCents: number;
}

export interface AppState {
  rulesText: string | null;
  rulesSummary: string[];
  remaining: Remaining[];
  paypal: { linked: boolean; email: string | null; clientId: string | null };
  humanCheck: { siteKey: string; needed: true } | { siteKey: null; needed: false };
  spentThisMonthCents: number; // everything the agent has paid this calendar month (UTC)
  purchases: Purchase[];
}

// Everything the page shows, in one object.
export function appState(wallet: Wallet): AppState {
  const history = paidHistory(wallet.id);
  const now = new Date();
  const remaining: Remaining[] = [];
  const rules = wallet.rules;

  if (rules) {
    for (const c of rules.categories) {
      if (c.budget === null) continue;
      const period = c.period ?? "week";
      const name = c.name.toLowerCase();
      remaining.push({
        label: c.name.charAt(0).toUpperCase() + c.name.slice(1),
        period,
        budgetCents: cents(c.budget),
        spentCents: spentSince(history, periodStart(period, now), (p) => p.category.toLowerCase() === name),
      });
    }
    if (rules.overallBudget !== null) {
      const period = rules.overallPeriod ?? "month";
      remaining.push({
        label: "In total",
        period,
        budgetCents: cents(rules.overallBudget),
        spentCents: spentSince(history, periodStart(period, now), () => true),
      });
    }
  }

  return {
    rulesText: wallet.rulesText,
    rulesSummary: rules ? describeRules(rules).split("\n") : [],
    remaining,
    paypal: { linked: Boolean(wallet.paypalTokenId), email: wallet.paypalEmail, clientId: paypalClientId() },
    humanCheck: humanCheck(wallet),
    spentThisMonthCents: spentSince(history, periodStart("month", now), () => true),
    purchases: listPurchases(wallet.id),
  };
}

function humanCheck(wallet: Wallet): AppState["humanCheck"] {
  const siteKey = captchaSiteKey();
  return siteKey && !wallet.verified ? { siteKey, needed: true } : { siteKey: null, needed: false };
}
