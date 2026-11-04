import { z } from "zod";

// The person's spending rules, in the shape Claude turns their plain words into.
// Amounts are US dollars here; the guard converts them to cents.

export const Period = z.enum(["week", "month"]);
export type Period = z.infer<typeof Period>;

export const CategoryRule = z.object({
  name: z
    .string()
    .describe("Short lowercase name for this kind of purchase, e.g. groceries, gifts, household"),
  budget: z
    .number()
    .nullable()
    .describe("Most the agent may spend on this category per period, in US dollars. Null if no limit was given."),
  period: Period.nullable().describe("The period the budget resets on. Null if there is no budget."),
  maxItemPrice: z
    .number()
    .nullable()
    .describe("Most the agent may pay for a single purchase in this category, in US dollars. Null if not given."),
});
export type CategoryRule = z.infer<typeof CategoryRule>;

export const RulesSchema = z.object({
  categories: z.array(CategoryRule),
  overallBudget: z
    .number()
    .nullable()
    .describe("Most the agent may spend in total per overall period, in US dollars. Null if not given."),
  overallPeriod: Period.nullable(),
  maxItemPrice: z
    .number()
    .nullable()
    .describe("Most the agent may pay for any single purchase, whatever the category. Null if not given."),
  askBeforeNewShop: z
    .boolean()
    .describe("True if the person wants to be asked before the agent buys from a shop it has not used before."),
  neverBuy: z
    .array(z.string())
    .describe("Kinds of purchase that are never allowed, lowercase, e.g. subscriptions, alcohol, gift cards"),
  trustedShops: z
    .array(z.string())
    .describe("Shop website domains the person already trusts, e.g. target.com. Empty if none were named."),
});
export type Rules = z.infer<typeof RulesSchema>;

export const EXAMPLE_RULES_TEXT =
  "$60 a week on groceries. Gifts up to $40 each. Ask me before using a shop you haven't used before. No subscriptions.";
