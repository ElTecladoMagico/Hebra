// @vitest-environment node
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import scoreHot from "../fixtures/gemini/score-hot.json";
import scoreMalformed from "../fixtures/gemini/score-malformed.json";
import { safeParseScoring, scoreIntent } from "../../convex/lib/gemini";

const server = setupServer();
beforeAll(() => {
  process.env.GEMINI_API_KEY = "test_key";
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("scoreIntent", () => {
  test("returns parsed score from valid response with cost > 0", async () => {
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () =>
        HttpResponse.json(scoreHot),
      ),
    );
    const result = await scoreIntent(
      "Busco programador",
      "necesito web",
      "Freelance dev",
    );
    expect(result.score).toBe(92);
    expect(result.reasoning).toMatch(/programador|presupuesto/);
    expect(result.costCents).toBeGreaterThan(0);
  });

  test("falls back to score 0 on malformed text response", async () => {
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () =>
        HttpResponse.json(scoreMalformed),
      ),
    );
    const result = await scoreIntent("title", "body", "offering");
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain("malformed");
  });

  test("throws on Gemini 500 after retries exhausted", async () => {
    let calls = 0;
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () => {
        calls++;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    await expect(scoreIntent("t", "b", "o")).rejects.toThrow(/Gemini error: 500/);
    expect(calls).toBeGreaterThanOrEqual(4); // 1 initial + 3 retries
  }, 30_000); // generous timeout: jittered backoff can take ~10s
});

describe("safeParseScoring", () => {
  test("clamps score above 100", () => {
    expect(
      safeParseScoring(JSON.stringify({ score: 150, reasoning: "x" })).score,
    ).toBe(100);
  });
  test("clamps score below 0", () => {
    expect(
      safeParseScoring(JSON.stringify({ score: -10, reasoning: "x" })).score,
    ).toBe(0);
  });
  test("returns 0 + 'malformed' message on bad json", () => {
    const r = safeParseScoring("not json");
    expect(r.score).toBe(0);
    expect(r.reasoning).toContain("malformed");
  });
});
