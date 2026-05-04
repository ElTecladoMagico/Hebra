import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const totalCostToday = internalQuery({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("usageDaily")
      .withIndex("by_date", (q) => q.eq("dateKey", args.dateKey))
      .collect();
    return rows.reduce((sum, r) => sum + r.geminiCostCents, 0);
  },
});

export const getOrCreate = internalMutation({
  args: { userId: v.id("users"), dateKey: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("usageDaily")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("dateKey", args.dateKey)
      )
      .unique();
    if (existing) return existing;
    const id = await ctx.db.insert("usageDaily", {
      userId: args.userId,
      dateKey: args.dateKey,
      scoringCalls: 0,
      replyGenerations: 0,
      keywordGenerations: 0,
      geminiCostCents: 0,
    });
    return await ctx.db.get(id);
  },
});

export const incrementScoring = internalMutation({
  args: {
    userId: v.id("users"),
    dateKey: v.string(),
    costCents: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("usageDaily")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("dateKey", args.dateKey)
      )
      .unique();
    if (!row) {
      await ctx.db.insert("usageDaily", {
        userId: args.userId,
        dateKey: args.dateKey,
        scoringCalls: 1,
        replyGenerations: 0,
        keywordGenerations: 0,
        geminiCostCents: args.costCents,
      });
    } else {
      await ctx.db.patch(row._id, {
        scoringCalls: row.scoringCalls + 1,
        geminiCostCents: row.geminiCostCents + args.costCents,
      });
    }
  },
});

export const incrementReply = internalMutation({
  args: {
    userId: v.id("users"),
    dateKey: v.string(),
    costCents: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("usageDaily")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("dateKey", args.dateKey)
      )
      .unique();
    if (!row) {
      await ctx.db.insert("usageDaily", {
        userId: args.userId,
        dateKey: args.dateKey,
        scoringCalls: 0,
        replyGenerations: 1,
        keywordGenerations: 0,
        geminiCostCents: args.costCents,
      });
    } else {
      await ctx.db.patch(row._id, {
        replyGenerations: row.replyGenerations + 1,
        geminiCostCents: row.geminiCostCents + args.costCents,
      });
    }
  },
});

export function utcDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
