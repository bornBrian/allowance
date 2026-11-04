import type { Rules } from "./rules";

// The rules as short plain sentences, for the agent's instructions and the screen.
export function describeRules(r: Rules): string {
  const lines: string[] = [];
  for (const c of r.categories) {
    const parts: string[] = [];
    if (c.budget !== null) parts.push(`$${c.budget} a ${c.period ?? "week"}`);
    if (c.maxItemPrice !== null) parts.push(`up to $${c.maxItemPrice} each`);
    lines.push(`${cap(c.name)}: ${parts.join(", ") || "no limit given"}.`);
  }
  if (r.overallBudget !== null) lines.push(`In total: $${r.overallBudget} a ${r.overallPeriod ?? "month"}.`);
  if (r.maxItemPrice !== null) lines.push(`Any single purchase: up to $${r.maxItemPrice}.`);
  if (r.askBeforeNewShop) lines.push("Ask before buying from a shop not used before.");
  if (r.trustedShops.length) lines.push(`Trusted shops: ${r.trustedShops.join(", ")}.`);
  if (r.neverBuy.length) lines.push(`Never buy: ${r.neverBuy.join(", ")}.`);
  return lines.join("\n");
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
