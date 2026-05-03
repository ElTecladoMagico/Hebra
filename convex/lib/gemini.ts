import { withRetry } from "./retry";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ScoringResult {
  score: number;
  reasoning: string;
}

const SCORING_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER" },
    reasoning: { type: "STRING" },
  },
  required: ["score", "reasoning"],
};

export async function scoreIntent(
  postTitle: string,
  postBody: string,
  campaignOffering: string,
): Promise<ScoringResult & { costCents: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const prompt = buildScoringPrompt(postTitle, postBody, campaignOffering);
  const url = `${ENDPOINT}/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  const res = await withRetry(async () => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCORING_SCHEMA,
          temperature: 0.2,
        },
      }),
    });
    if (!r.ok) {
      const err = new Error(`Gemini error: ${r.status}`) as Error & { status: number };
      err.status = r.status;
      throw err;
    }
    return r;
  });

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const usage = data?.usageMetadata ?? { promptTokenCount: 0, candidatesTokenCount: 0 };
  const costCents = computeCostCents(usage.promptTokenCount, usage.candidatesTokenCount);

  const parsed = safeParseScoring(text);
  return { ...parsed, costCents };
}

function buildScoringPrompt(title: string, body: string, offering: string): string {
  return `You are a lead-scoring agent for a Spanish freelancer/agency platform.
Score this Reddit post on a scale 0-100 for how likely it represents a buying intent for the offering described.

OFFERING: ${offering}

POST TITLE: ${title}

POST BODY: ${body}

Score guidelines:
- 85-100: explicit need, ready to hire, budget mentioned
- 70-84: clear pain point, evaluating options
- 50-69: tangentially related, exploratory
- 0-49: not a fit

Return JSON: { "score": <int 0-100>, "reasoning": "<one sentence in Spanish>" }`;
}

export function safeParseScoring(text: string): ScoringResult {
  try {
    const obj = JSON.parse(text);
    const score = typeof obj.score === "number" ? Math.max(0, Math.min(100, obj.score)) : 0;
    const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "scoring failed";
    return { score, reasoning };
  } catch {
    return { score: 0, reasoning: "scoring failed: malformed response" };
  }
}

// Gemini Flash-Lite pricing approx: $0.075 per 1M input tokens, $0.40 per 1M output tokens.
// Convert to cents: cost_usd * 100. Use 4-decimal precision for sub-cent accuracy.
function computeCostCents(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens * 0.075 + outputTokens * 0.4) / 1_000_000;
  return Math.round(usd * 100 * 10000) / 10000;
}
