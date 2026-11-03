import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { addAiSpend, aiSpentToday } from "./db";
import { LimitReached, UserError } from "./errors";
import { RulesSchema, type Rules } from "./rules";

export const MODEL = "claude-opus-5-5";

// Server-side fallback: if a request is declined, the API retries it on a
// suitable model inside the same call.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

// Created on first use, so the app starts (and the page loads) before a key is set.
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// A hard daily ceiling on what the hosted demo spends on Claude, whoever is using it.
export function checkDailyLimit() {
  const cap = Number(process.env.DAILY_AI_BUDGET_USD ?? "5");
  if (aiSpentToday() >= cap) {
    const now = Date.now();
    const midnight = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
    throw new LimitReached("The demo has used its AI budget for today. Please try again tomorrow.", Math.ceil((midnight - now) / 1000));
  }
}

// Claude Opus 5.5 prices, US dollars per million tokens.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function recordUsage(u: Usage) {
  const usd =
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
    1_000_000;
  addAiSpend(usd);
}

// Turns "$60 a week on groceries, gifts up to $40..." into structured rules.
export async function parseRules(text: string): Promise<Rules> {
  checkDailyLimit();
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
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
  checkDailyLimit();
  const names = rules.categories.map((c) => c.name).join(", ") || "none";
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(Classification) },
    system: `Classify a shopping request. The person's spending categories are: ${names}.`,
    messages: [{ role: "user", content: request }],
  });
  recordUsage(response.usage);
  if (!response.parsed_output) throw new UserError("Couldn't understand that request.");
  return { ...response.parsed_output, category: response.parsed_output.category.trim().toLowerCase() };
}
