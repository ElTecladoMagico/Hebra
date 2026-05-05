"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Card } from "../ui/Card";
import { DraftBlock } from "./leadDetail/DraftBlock";
import { PostBlock } from "./leadDetail/PostBlock";
import { TweakActionsBlock } from "./leadDetail/TweakActionsBlock";

interface LeadDetailProps {
  leadId: Id<"leads">;
  onArchived?: () => void;
}

/**
 * Orchestrator for the lead detail pane. Owns Convex hooks, generation +
 * error state, and the `markRead` ref guard. Composes three presentational
 * sub-components: PostBlock, DraftBlock, TweakActionsBlock.
 */
export function LeadDetail({ leadId, onArchived }: LeadDetailProps) {
  const lead = useQuery(api.leads.getById, { leadId });
  const reply = useQuery(api.replies.getByLead, { leadId });
  const markRead = useMutation(api.leads.markRead);
  const setArchived = useMutation(api.leads.setArchived);
  const markCopied = useMutation(api.replies.markCopied);
  const generate = useAction(api.actions.generateReply.generate);

  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Fire markRead at most once per lead, the moment the lead loads as unread.
  const markReadFiredFor = useRef<Id<"leads"> | null>(null);
  useEffect(() => {
    if (!lead) return;
    if (markReadFiredFor.current === lead._id) return;
    if (lead.read) {
      markReadFiredFor.current = lead._id;
      return;
    }
    markReadFiredFor.current = lead._id;
    markRead({ leadId: lead._id }).catch((err) => {
      console.error("[LeadDetail] markRead failed:", err);
    });
  }, [lead, markRead]);

  // Reset transient generation error on lead change. We intentionally watch
  // only `leadId` — setters are stable and biome flags them, but the semantic
  // trigger here is "lead changed".
  // biome-ignore lint/correctness/useExhaustiveDependencies: setters are stable; leadId is the real trigger.
  useEffect(() => {
    setGenerationError(null);
  }, [leadId]);

  async function handleGenerate(appendTweak?: string) {
    if (generating) return;
    setGenerating(true);
    setGenerationError(null);
    try {
      await generate({ leadId, appendTweak });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al generar respuesta.";
      setGenerationError(message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!reply || !lead?.post) return;
    try {
      await navigator.clipboard.writeText(reply.draftText);
    } catch (err) {
      console.error("[LeadDetail] clipboard failed:", err);
    }
    try {
      await markCopied({ replyId: reply._id });
    } catch (err) {
      console.error("[LeadDetail] markCopied failed:", err);
    }
    window.open(lead.post.permalink, "_blank", "noopener,noreferrer");
  }

  async function handleArchive() {
    try {
      await setArchived({ leadId, archived: true });
      onArchived?.();
    } catch (err) {
      console.error("[LeadDetail] setArchived failed:", err);
    }
  }

  if (lead === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-48 animate-pulse rounded-2xl border border-surface-border bg-surface" />
        <div className="h-64 animate-pulse rounded-2xl border border-surface-border bg-surface" />
      </div>
    );
  }

  if (lead === null) {
    return (
      <Card variant="surface" className="text-center">
        <p className="text-sm text-zinc-500">No encontramos esta señal o ya no tienes acceso.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <PostBlock post={lead.post} lead={lead} />
      <DraftBlock
        reply={reply}
        generating={generating}
        error={generationError}
        onGenerate={() => handleGenerate()}
      />
      <TweakActionsBlock
        reply={reply ?? null}
        permalink={lead.post?.permalink ?? ""}
        disabled={generating}
        onTweak={(tweak) => handleGenerate(tweak)}
        onRegenerate={() => handleGenerate()}
        onCopy={handleCopy}
        onArchive={handleArchive}
      />
    </div>
  );
}
