"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

const TWEAK_CHIPS = [
  "más casual",
  "más profesional",
  "más corto",
  "más largo",
  "menos comercial",
  "más cálido",
] as const;

const COPY_FEEDBACK_MS = 2000;

interface TweakActionsBlockProps {
  reply: Doc<"replies"> | null;
  permalink: string;
  disabled: boolean;
  onTweak: (tweak: string) => void;
  onRegenerate: () => void;
  onCopy: () => Promise<void> | void;
  onArchive: () => void;
}

/**
 * Bottom action row: 6 tweak chips, Regenerar, glass primary "Copiar y abrir
 * Reddit" (with a 2s ✓ Copiado swap), and an Archive button. The label-swap
 * `copied` state is local — it's pure visual feedback.
 *
 * `permalink` is intentionally part of the contract even though `onCopy`
 * is what actually opens the new tab in the orchestrator: keeping it here
 * documents that this block is the consumer of the post URL action.
 */
export function TweakActionsBlock({
  reply,
  disabled,
  onTweak,
  onRegenerate,
  onCopy,
  onArchive,
}: TweakActionsBlockProps) {
  const [copied, setCopied] = useState(false);

  if (!reply) {
    // No draft yet — surface only the discreet archive action.
    return (
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onArchive}>
          Archivar señal
        </Button>
      </div>
    );
  }

  async function handleCopyClick() {
    await onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }

  return (
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
              disabled={disabled}
              onClick={() => onTweak(chip)}
            >
              {chip}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onArchive} disabled={disabled}>
          Archivar señal
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onRegenerate}
            disabled={disabled}
          >
            Regenerar
          </Button>
          <Button
            type="button"
            variant="glass"
            size="lg"
            onClick={handleCopyClick}
            disabled={disabled}
            aria-live="polite"
          >
            {copied ? "✓ Copiado" : "📋 Copiar y abrir Reddit"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
