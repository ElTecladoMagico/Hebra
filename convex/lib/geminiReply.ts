import { withRetry } from "./retry";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ReplySettings {
  tone: "casual" | "professional" | "friendly";
  length: "short" | "medium" | "long";
  style: "value-first" | "value-mention" | "direct-offer";
  includeCTA: boolean;
  personalize: boolean;
  includePhrases?: string;
  replyDialect: "es-neutral" | "es-ES" | "es-LATAM";
}

export async function generateReplyDraft(
  postTitle: string,
  postBody: string,
  campaignOffering: string,
  websiteUrl: string | undefined,
  settings: ReplySettings,
  appliedTweaks: string[] = [],
): Promise<{ draft: string; costCents: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const prompt = buildReplyPrompt(
    postTitle,
    postBody,
    campaignOffering,
    websiteUrl,
    settings,
    appliedTweaks,
  );
  const url = `${ENDPOINT}/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await withRetry(async () => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });
    if (!r.ok) {
      const err = new Error(`Gemini reply error: ${r.status}`) as Error & {
        status: number;
      };
      err.status = r.status;
      throw err;
    }
    return r;
  });

  const data = await res.json();
  const draft = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const usage = data?.usageMetadata ?? {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
  };
  const costCents = computeReplyCostCents(
    usage.promptTokenCount,
    usage.candidatesTokenCount,
  );
  return { draft, costCents };
}

// Gemini Flash pricing approx: $0.30/M input tokens, $2.50/M output tokens.
// Convert to cents: cost_usd * 100. Use 4-decimal precision for sub-cent
// accuracy — integer rounding makes the daily cost guard blind because
// each reply call costs sub-cent. Match the precision pattern in
// `lib/gemini.ts:92-95`.
export function computeReplyCostCents(
  inputTokens: number,
  outputTokens: number,
): number {
  const usd = (inputTokens * 0.3 + outputTokens * 2.5) / 1_000_000;
  return Math.round(usd * 100 * 10000) / 10000;
}

export function buildReplyPrompt(
  title: string,
  body: string,
  offering: string,
  websiteUrl: string | undefined,
  s: ReplySettings,
  tweaks: string[],
): string {
  const dialect =
    s.replyDialect === "es-ES"
      ? "Spanish from Spain (peninsular: tú/tío/vale)"
      : s.replyDialect === "es-LATAM"
        ? "Latin American Spanish (vos/che acceptable, neutral if mixed)"
        : "neutral Spanish";
  const styleGuide = {
    "value-first":
      "Lead with concrete value or a specific tip relevant to their question. Mention your service ONLY if it directly answers them, and do so subtly.",
    "value-mention":
      "Provide value, then briefly mention what you offer as a possible fit.",
    "direct-offer":
      "Acknowledge their need and pitch your service directly. WARNING: this style risks downvotes/spam reports on Reddit. Use only when the post explicitly asks for service providers.",
  }[s.style];
  const lengthHint = {
    short: "1-2 sentences",
    medium: "3-5 sentences",
    long: "1-2 paragraphs",
  }[s.length];
  const cta = s.includeCTA
    ? "End with a soft call-to-action (DM offer, website link, or 'happy to chat'). Avoid pushy CTAs."
    : "Do not include any CTA. Just be helpful.";
  const personalize = s.personalize
    ? `Personalize by referencing specifics from the post (e.g., the user's situation, the project type they mentioned).`
    : "";
  const phrases = s.includePhrases
    ? `Try to organically include one of these phrases if natural: "${s.includePhrases}".`
    : "";
  const tweakSection = tweaks.length
    ? `\n\nADDITIONAL ADJUSTMENTS (apply on top of the base style):\n${tweaks.map((t) => `- ${t}`).join("\n")}`
    : "";

  return `You write a helpful, non-spammy reply to a Reddit post on behalf of a freelancer/agency.

DIALECT: write in ${dialect}.

TONE: ${s.tone}.
LENGTH: ${lengthHint}.
STYLE: ${styleGuide}
CTA: ${cta}
PERSONALIZATION: ${personalize}
${phrases}

FREELANCER'S OFFERING: ${offering}
${websiteUrl ? `WEBSITE: ${websiteUrl}` : ""}

POST TITLE: ${title}
POST BODY: ${body}${tweakSection}

Write the reply text only. No greetings like "Hello!" — Reddit replies usually start in-context. No sign-off. No quoting the original post.`;
}
