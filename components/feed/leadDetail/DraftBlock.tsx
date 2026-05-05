"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/relativeTime";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Textarea } from "../../ui/Textarea";

interface DraftBlockProps {
  reply: Doc<"replies"> | null | undefined;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}

/**
 * Draft display: empty-state CTA, read-only textarea + applied tweaks +
 * generation timestamp, spinner with dim while generating, and a real
 * error panel (`role="alert"` is correct here — generation errors are
 * interruptive events).
 *
 * Purely presentational: state lives in the orchestrator.
 */
export function DraftBlock({ reply, generating, error, onGenerate }: DraftBlockProps) {
  return (
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

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-tier-hot-bg px-3 py-2 text-sm text-tier-hot ring-1 ring-tier-hot/20"
        >
          {error}
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
            onClick={onGenerate}
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
  );
}
