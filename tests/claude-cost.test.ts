import { describe, expect, it } from "vitest";
import { costUsd } from "@/lib/claude";

const usage = { input_tokens: 20_000, output_tokens: 4_000 };

describe("costUsd", () => {
  it("prices Claude Haiku 5.5 at $0.10 in and $0.50 out per million tokens", () => {
    expect(costUsd("claude-haiku-5-5", usage)).toBeCloseTo(0.004, 6);
  });

  it("prices an unknown model as the dearest, so caps stop early rather than late", () => {
    expect(costUsd("some-new-model", usage)).toBeCloseTo(costUsd("claude-opus-5-5", usage), 6);
    expect(costUsd("some-new-model", usage)).toBeGreaterThan(costUsd("claude-haiku-5-5", usage));
  });

  it("counts cache writes and reads", () => {
    const cached = { ...usage, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 };
    expect(costUsd("claude-haiku-5-5", cached) - costUsd("claude-haiku-5-5", usage)).toBeCloseTo(0.135, 6);
  });
});
