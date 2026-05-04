// @vitest-environment node
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import replyOk from "../fixtures/gemini/reply-ok.json";
import replyMalformed from "../fixtures/gemini/reply-malformed.json";
import {
  buildReplyPrompt,
  computeReplyCostCents,
  generateReplyDraft,
  type ReplySettings,
} from "../../convex/lib/geminiReply";

const server = setupServer();
beforeAll(() => {
  process.env.GEMINI_API_KEY = "test_key";
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const baseSettings: ReplySettings = {
  tone: "friendly",
  length: "medium",
  style: "value-first",
  includeCTA: true,
  personalize: true,
  replyDialect: "es-neutral",
};

describe("buildReplyPrompt", () => {
  test("is deterministic — same inputs produce identical prompt", () => {
    const a = buildReplyPrompt(
      "Title",
      "Body",
      "Freelance dev",
      "https://example.com",
      baseSettings,
      [],
    );
    const b = buildReplyPrompt(
      "Title",
      "Body",
      "Freelance dev",
      "https://example.com",
      baseSettings,
      [],
    );
    expect(a).toBe(b);
  });

  test("appending tweaks changes the prompt and lists each tweak", () => {
    const without = buildReplyPrompt(
      "Title",
      "Body",
      "offering",
      undefined,
      baseSettings,
      [],
    );
    const withTweaks = buildReplyPrompt(
      "Title",
      "Body",
      "offering",
      undefined,
      baseSettings,
      ["más conciso", "menos formal"],
    );
    expect(withTweaks).not.toBe(without);
    expect(without).not.toContain("ADDITIONAL ADJUSTMENTS");
    expect(withTweaks).toContain("ADDITIONAL ADJUSTMENTS");
    expect(withTweaks).toContain("- más conciso");
    expect(withTweaks).toContain("- menos formal");
  });

  test("first tweak on a previously empty tweaks array adds the section", () => {
    // Mirrors the action's path when previous.tweaks is [] and appendTweak is set.
    const empty = buildReplyPrompt(
      "T",
      "B",
      "o",
      undefined,
      baseSettings,
      [],
    );
    const firstTweak = buildReplyPrompt(
      "T",
      "B",
      "o",
      undefined,
      baseSettings,
      ["más casual"],
    );
    expect(empty).not.toContain("ADDITIONAL ADJUSTMENTS");
    expect(firstTweak).toContain("ADDITIONAL ADJUSTMENTS");
    expect(firstTweak).toContain("- más casual");
  });

  test("dialect injection differs between es-ES and es-LATAM", () => {
    const esES = buildReplyPrompt(
      "T",
      "B",
      "o",
      undefined,
      { ...baseSettings, replyDialect: "es-ES" },
      [],
    );
    const esLATAM = buildReplyPrompt(
      "T",
      "B",
      "o",
      undefined,
      { ...baseSettings, replyDialect: "es-LATAM" },
      [],
    );
    expect(esES).toContain("Spanish from Spain");
    expect(esES).toContain("tú/tío/vale");
    expect(esLATAM).toContain("Latin American Spanish");
    expect(esLATAM).toContain("vos/che");
    expect(esES).not.toBe(esLATAM);
  });

  test("omits website line when undefined", () => {
    const prompt = buildReplyPrompt(
      "T",
      "B",
      "o",
      undefined,
      baseSettings,
      [],
    );
    expect(prompt).not.toContain("WEBSITE:");
  });

  test("includes CTA instruction when includeCTA=true and disables when false", () => {
    const withCTA = buildReplyPrompt("T", "B", "o", undefined, baseSettings, []);
    const withoutCTA = buildReplyPrompt(
      "T",
      "B",
      "o",
      undefined,
      { ...baseSettings, includeCTA: false },
      [],
    );
    expect(withCTA).toContain("call-to-action");
    expect(withoutCTA).toContain("Do not include any CTA");
  });
});

describe("computeReplyCostCents", () => {
  test("returns float with sub-cent precision (not integer rounded)", () => {
    // 800 in + 60 out @ $0.30/M + $2.50/M = (240 + 150)/1M usd = 0.00039 usd
    // = 0.039 cents -> Math.round(0.039 * 10000)/10000 = 0.039
    const c = computeReplyCostCents(800, 60);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
    // Critical: must NOT be integer-rounded to zero.
    expect(c).not.toBe(0);
  });

  test("zero tokens => zero cost", () => {
    expect(computeReplyCostCents(0, 0)).toBe(0);
  });
});

describe("generateReplyDraft", () => {
  test("returns trimmed draft and cost > 0 from a valid response", async () => {
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () =>
        HttpResponse.json(replyOk),
      ),
    );
    const result = await generateReplyDraft(
      "Busco dev",
      "necesito web",
      "Freelance dev",
      undefined,
      baseSettings,
      [],
    );
    expect(result.draft).toContain("Next.js");
    expect(result.costCents).toBeGreaterThan(0);
  });

  test("defaults to empty draft on malformed response (no candidates)", async () => {
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () =>
        HttpResponse.json(replyMalformed),
      ),
    );
    const result = await generateReplyDraft(
      "T",
      "B",
      "o",
      undefined,
      baseSettings,
      [],
    );
    expect(result.draft).toBe("");
    expect(result.costCents).toBe(0);
  });

  test("retries on 503 then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () => {
        calls++;
        if (calls < 2) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json(replyOk);
      }),
    );
    const result = await generateReplyDraft(
      "T",
      "B",
      "o",
      undefined,
      baseSettings,
      [],
    );
    expect(result.draft).toContain("Next.js");
    expect(calls).toBe(2);
  }, 30_000);

  test("throws on 4xx without retry (non-transient)", async () => {
    let calls = 0;
    server.use(
      http.post(/generativelanguage\.googleapis\.com.*/, () => {
        calls++;
        return new HttpResponse(null, { status: 400 });
      }),
    );
    await expect(
      generateReplyDraft("T", "B", "o", undefined, baseSettings, []),
    ).rejects.toThrow(/Gemini reply error: 400/);
    expect(calls).toBe(1);
  });
});
