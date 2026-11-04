import "server-only";
import { captchaSiteKey } from "./captcha";
import { listMembers, listPurchases, paidHistory, type Purchase } from "./db";
import { describeRules } from "./describe";
import { cents, periodStart, spentSince } from "./guard";
import { vapidPublicKey } from "./notify";
import { paypalClientId } from "./paypal";
import type { Actor } from "./session";

export interface Remaining {
  label: string;
  period: string;
  budgetCents: number;
  spentCents: number;
}

export interface AppState {
  role: "payer" | "member";
  ownerName: string | null; // the payer's name, as the people they look after see it
  memberName: string | null; // set when a person the payer looks after is using the page
  rulesText: string | null; // the payer's own words; only the payer sees them
  rulesSummary: string[];
  remaining: Remaining[];
  paypal: { linked: boolean; email: string | null; clientId: string | null };
  humanCheck: { siteKey: string; needed: true } | { siteKey: null; needed: false };
  spentThisMonthCents: number; // everything paid this calendar month (UTC), for this person
  purchases: Purchase[];
  members: { id: string; name: string }[]; // people the payer looks after (payer only)
  pushKey: string | null; // for turning on approval notifications (payer only)
}

// Everything the page shows, in one object, shaped for who is looking.
export function appState(actor: Actor): AppState {
  const { wallet } = actor;
  const member = actor.role === "member" ? actor.member : null;
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

  const purchases = listPurchases(wallet.id, member?.id);
  const monthStart = periodStart("month", now);
  const spentThisMonthCents = purchases
    .filter((p) => p.status === "paid" && new Date(p.createdAt) >= monthStart)
    .reduce((sum, p) => sum + p.amountCents, 0);

  return {
    role: actor.role,
    ownerName: wallet.ownerName,
    memberName: member?.name ?? null,
    rulesText: member ? null : wallet.rulesText,
    rulesSummary: rules ? describeRules(rules).split("\n") : [],
    remaining,
    paypal: {
      linked: Boolean(wallet.paypalTokenId),
      email: member ? null : wallet.paypalEmail,
      clientId: member ? null : paypalClientId(),
    },
    humanCheck: humanCheck(actor),
    spentThisMonthCents,
    purchases,
    members: member ? [] : listMembers(wallet.id).map((m) => ({ id: m.id, name: m.name })),
    pushKey: member ? null : vapidPublicKey(),
  };
}

function humanCheck({ wallet }: Actor): AppState["humanCheck"] {
  const siteKey = captchaSiteKey();
  return siteKey && !wallet.verified ? { siteKey, needed: true } : { siteKey: null, needed: false };
}
