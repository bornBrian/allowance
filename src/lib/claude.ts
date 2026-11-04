import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { addAiSpend, aiSpentToday, aiSpentTotal } from "./db";
import { LimitReached, UserError } from "./errors";
import { RulesSchema, type Rules } from "./rules";

// Claude Haiku 5.5: fast and low-cost, and enough for reading rules, sorting a
// request into a budget, and choosing a product. The model never decides about
// money (the guard does), so a smaller model costs nothing in safety.
export const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

let client: Anthropic | null = null;

// Created on first use, so the app starts (and the page loads) before a key is set.
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// US dollars per million tokens. An unknown model is priced as the dearest, so
// the caps below can only err towards stopping early.
const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};
const DEAREST = PRICES["claude-opus-5-5"];

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costUsd(model: string, u: Usage): number {
  const price = PRICES[model] ?? DEAREST;
  return (
    (u.input_tokens * price.input +
      u.output_tokens * price.output +
      (u.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1_000_000
  );
}

export function recordUsage(u: Usage) {
  addAiSpend(costUsd(MODEL, u));
}

// Two hard ceilings on Claude spending, whoever is using the app: one per UTC
// day, and one for the whole life of the demo. The API key's credit is shared,
// so the total cap is what protects everything else that uses it.
export function checkAiBudget() {
  const total = Number(process.env.AI_TOTAL_BUDGET_USD ?? "1");
  if (aiSpentTotal() >= total) {
    throw new LimitReached("The demo has used all of its AI budget. Spending and past purchases can still be viewed.", 86_400);
  }
  const daily = Number(process.env.DAILY_AI_BUDGET_USD ?? "0.25");
  if (aiSpentToday() >= daily) {
    const now = new Date();
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    throw new LimitReached(
      "The demo has used its AI budget for today. Please try again tomorrow.",
      Math.ceil((midnight - now.getTime()) / 1000),
    );
  }
}

// Turns "$60 a week on groceries, gifts up to $40..." into structured rules.
export async function parseRules(text: string): Promise<Rules> {
  checkAiBudget();
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(RulesSchema) },
    system:
      "You turn a person's plain-language spending rules for their shopping agent into structured rules. " +
      "Only record limits the person actually stated; use null or an empty list for anything they didn't mention. " +
      "Amounts are US dollars. 'A week' or 'weekly' means period week; 'a month' means period month. " +
      "If they say to ask before new or unknown shops, set askBeforeNewShop to true.",
    messages: [{ role: "user", content: text }],
  });
  recordUsage(response.usage);
  if (!response.parsed_output) throw new UserError("Couldn't read those rules. Try writing them a little differently.");
  return response.parsed_output;
}

const Classification = z.object({
  category: z
    .string()
    .describe("One of the person's category names if the request fits one, otherwise a short new lowercase name"),
  search: z.string().describe("A short product search query for the request, e.g. 'gardening gift set'"),
  maxPrice: z.number().nullable().describe("A price ceiling in US dollars if the person gave one in this request"),
});
export type Classification = z.infer<typeof Classification>;

// Decides which budget a request belongs to, from the person's words alone,
// before any product data is seen. A product page can't move a purchase into
// a roomier budget, because the category is settled here first.
export async function classifyRequest(request: string, rules: Rules): Promise<Classification> {
  checkAiBudget();
  const names = rules.categories.map((c) => c.name).join(", ") || "none";
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 500,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(Classification) },
    system:
      `Classify a shopping request. The person's spending categories are: ${names}. ` +
      "Use the category whose meaning fits: a broad household category such as home covers everyday things for " +
      "the house and the person, including clothes, kitchen things and small furniture; groceries means food, drink " +
      "and household consumables; gifts are things bought for someone else. Only give a new short lowercase name " +
      "when none of the categories could reasonably cover it (for example medicine when the only categories are " +
      "gifts and groceries), so that the person is asked about it.",
    messages: [{ role: "user", content: request }],
  });
  recordUsage(response.usage);
  if (!response.parsed_output) throw new UserError("Couldn't understand that request.");
  return { ...response.parsed_output, category: response.parsed_output.category.trim().toLowerCase() };
}
