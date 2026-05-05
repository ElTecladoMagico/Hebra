"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Textarea } from "../ui/Textarea";
import { DialectChip } from "./DialectChip";
import { ScoreBadge } from "./ScoreBadge";

const TWEAK_CHIPS = [
  "más casual",
  "más profesional",
  "más corto",
  "más largo",
  "menos comercial",
  "más cálido",
] as const;

const POST_BODY_PREVIEW_LINES = 6;
const POST_BODY_PREVIEW_CHARS = 280;
const COPY_FEEDBACK_MS = 2000;

interface LeadDetailProps {
  leadId: Id<"leads">;
  onArchived?: () => void;
}

export function LeadDetail({ leadId, onArchived }: LeadDetailProps) {
  const lead = useQuery(api.leads.getById, { leadId });
  const reply = useQuery(api.replies.getByLead, { leadId });
  const markRead = useMutation(api.leads.markRead);
  const setArchived = useMutation(api.leads.setArchived);
  const markCopied = useMutation(api.replies.markCopied);
  const generate = useAction(api.actions.generateReply.generate);

  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);

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

  // Reset transient UI state on lead change. We intentionally watch only
  // `leadId` — the setters are stable identities and biome flags them, but the
  // semantic trigger here is "lead changed".
  // biome-ignore lint/correctness/useExhaustiveDependencies: setters are stable; leadId is the real trigger.
  useEffect(() => {
    setGenerationError(null);
    setCopied(false);
    setBodyExpanded(false);
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
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
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

  const post = lead.post;

  return (
    <div className="space-y-4 pb-6">
      {/* Post block */}
      <Card variant="surface" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {post && (
              <>
                <span className="font-semibold text-zinc-700">r/{post.subreddit}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRelativeTime(post.postedAt)}</span>
                <DialectChip dialect={post.detectedDialect} />
              </>
            )}
          </div>
          <ScoreBadge tier={lead.tier} score={lead.score} />
        </div>

        {post ? (
          <>
            <h2 className="text-xl font-bold leading-tight tracking-tight text-zinc-900">
              {post.title}
            </h2>
            {post.body && (
              <div className="space-y-2">
                <p
                  className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700"
                  style={
                    bodyExpanded
                      ? undefined
                      : ({
                          display: "-webkit-box",
                          WebkitLineClamp: POST_BODY_PREVIEW_LINES,
                          WebkitBoxOrient: "vertical" as const,
                          overflow: "hidden",
                        } as React.CSSProperties)
                  }
                >
                  {post.body}
                </p>
                {(post.body.split("\n").length > POST_BODY_PREVIEW_LINES ||
                  post.body.length > POST_BODY_PREVIEW_CHARS) && (
                  <button
                    type="button"
                    onClick={() => setBodyExpanded((v) => !v)}
                    className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
                  >
                    {bodyExpanded ? "Mostrar menos" : "Mostrar más"}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">Post no disponible.</p>
        )}

        {lead.reasoning && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs italic text-zinc-600">
            <span aria-hidden="true">💡</span> {lead.reasoning}
          </p>
        )}

        {post && (
          <div className="flex justify-end">
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-900/5 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2"
            >
              Ver en Reddit ↗
            </a>
          </div>
        )}
      </Card>

      {/* Draft block */}
      <Card variant="surface" className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Tu respuesta
          </h3>
          {reply && (
            <span className="text-xs text-zinc-400">
              Generada {formatRelativeTime(reply.generatedAt)}
            </span>
          )}
        </div>

        {generationError && (
          <div
            role="alert"
            className="rounded-xl bg-tier-hot-bg px-3 py-2 text-sm text-tier-hot ring-1 ring-tier-hot/20"
          >
            {generationError}
          </div>
        )}

        {!reply && !generating && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="max-w-sm text-sm text-zinc-500">
              Hebra puede redactar un primer borrador a partir del post y de tu campaña.
            </p>
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={() => handleGenerate()}
              disabled={generating}
            >
              Generar respuesta con IA
            </Button>
          </div>
        )}

        {(reply || generating) && (
          <div className={`space-y-3 ${generating ? "opacity-60" : ""}`}>
            <Textarea
              value={reply?.draftText ?? ""}
              readOnly
              rows={Math.max(6, Math.min(16, (reply?.draftText.split("\n").length ?? 6) + 2))}
              aria-label="Borrador de respuesta"
              className="font-[inherit] leading-relaxed"
            />
            {generating && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900"
                />
                Generando con IA…
              </div>
            )}

            {reply && reply.tweaks.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-zinc-400">
                  Ajustes aplicados
                </span>
                {reply.tweaks.map((t, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: tweaks is append-only history.
                  <Badge key={`${t}-${i}`}>{t}</Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Tweak chips + primary CTA — only relevant once a draft exists. */}
      {reply && (
        <Card variant="surface" className="space-y-4">
          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-wide text-zinc-400">Ajustar</span>
            <div className="flex flex-wrap gap-1.5">
              {TWEAK_CHIPS.map((chip) => (
                <Button
                  key={chip}
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={generating}
                  onClick={() => handleGenerate(chip)}
                >
                  {chip}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleArchive}
              disabled={generating}
            >
              Archivar señal
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => handleGenerate()}
                disabled={generating}
              >
                Regenerar
              </Button>
              <Button
                type="button"
                variant="glass"
                size="lg"
                onClick={handleCopy}
                disabled={generating}
                aria-live="polite"
              >
                {copied ? "✓ Copiado" : "📋 Copiar y abrir Reddit"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* When there's no reply yet, still surface the archive action discreetly. */}
      {!reply && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleArchive}>
            Archivar señal
          </Button>
        </div>
      )}
    </div>
  );
}
