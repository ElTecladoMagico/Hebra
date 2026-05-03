import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { utcDateKey } from "../usage";

export type QuotaOp = "scoring" | "reply" | "keyword";

const QUOTAS: Record<"free" | "trial" | "pro", Record<QuotaOp, number>> = {
  free: { scoring: 20, reply: 5, keyword: 5 },
  trial: { scoring: 200, reply: 50, keyword: 20 },
  pro: { scoring: 200, reply: 50, keyword: 20 },
};

export class QuotaExceededError extends Error {
  constructor(
    public op: QuotaOp,
    public used: number,
    public limit: number
  ) {
    super(`Quota exceeded for ${op}: ${used}/${limit}`);
    this.name = "QuotaExceededError";
  }
}

export async function ensureUserQuotaOk(
  ctx: ActionCtx,
  userId: Id<"users">,
  op: QuotaOp
): Promise<void> {
  const dateKey = utcDateKey(Date.now());
  const user = await ctx.runQuery(internal.users.getInternal, { userId });
  if (!user) throw new Error(`User not found: ${userId}`);
  const limit = QUOTAS[user.tier][op];
  const row = await ctx.runMutation(internal.usage.getOrCreate, { userId, dateKey });
  const counterField =
    op === "scoring"
      ? "scoringCalls"
      : op === "reply"
        ? "replyGenerations"
        : "keywordGenerations";
  const used = (row as { [k: string]: number } | null)?.[counterField] ?? 0;
  if (used >= limit) {
    throw new QuotaExceededError(op, used, limit);
  }
}
