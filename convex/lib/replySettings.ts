import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/**
 * Single source of truth for the reply-settings shape used across the app:
 *   - `convex/schema.ts` campaigns.replySettings field
 *   - `convex/campaigns.ts` createCampaign args validator
 *   - `convex/lib/geminiReply.ts` prompt-assembly input
 *   - `components/campaign/ReplySettingsForm.tsx` UI state
 *
 * The validator and the type are both exported so runtime validation
 * (Convex `args`) and TypeScript inference stay locked together. If the
 * shape changes, edit it here and every consumer updates.
 */
export const replySettingsValidator = v.object({
  tone: v.union(
    v.literal("casual"),
    v.literal("professional"),
    v.literal("friendly"),
  ),
  length: v.union(v.literal("short"), v.literal("medium"), v.literal("long")),
  style: v.union(
    v.literal("value-first"),
    v.literal("value-mention"),
    v.literal("direct-offer"),
  ),
  includeCTA: v.boolean(),
  personalize: v.boolean(),
  includePhrases: v.optional(v.string()),
  replyDialect: v.union(
    v.literal("es-neutral"),
    v.literal("es-ES"),
    v.literal("es-LATAM"),
  ),
});

/** Inferred from the schema-applied validator. */
export type ReplySettings = Doc<"campaigns">["replySettings"];
