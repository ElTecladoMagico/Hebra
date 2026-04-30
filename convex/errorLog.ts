import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const insert = internalMutation({
  args: {
    service: v.string(),
    operation: v.string(),
    errorMessage: v.string(),
    errorCode: v.optional(v.string()),
    context: v.optional(v.any()),
    severity: v.union(
      v.literal("info"),
      v.literal("warn"),
      v.literal("error"),
      v.literal("critical")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("errorLog", args);
  },
});
