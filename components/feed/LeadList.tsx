"use client";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useEffect, useRef, useState } from "react";
import { Card } from "../ui/Card";
import { ScoreBadge } from "./ScoreBadge";

interface LeadListProps {
  leads: Doc<"leads">[] | undefined;
  selectedLeadId: Id<"leads"> | undefined;
  onSelect: (leadId: Id<"leads">) => void;
}

const NEAR_TOP_PX = 120;

/**
 * Left-pane lead list. Plain `surface` rows — no glass — to honor the A2
 * scope (glass is reserved for chrome and the primary CTA).
 *
 * Accessibility: each row is a `<button>` so Tab/Enter/Space work natively.
 * Active row uses `aria-current="true"` plus an inset left rail accent.
 * A visually-hidden polite live region announces new arrivals to SR users.
 *
 * Auto-scroll: when the top lead's id changes (a new arrival landed), the
 * top of the list is scrolled into view — but only when the user is near the
 * top (< 120px scroll). Mid-scroll users keep their place; the live region
 * still announces. `prefers-reduced-motion` falls back to `behavior: "auto"`.
 */
export function LeadList({ leads, selectedLeadId, onSelect }: LeadListProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const topItemRef = useRef<HTMLLIElement | null>(null);
  const lastTopIdRef = useRef<Id<"leads"> | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!leads || leads.length === 0) {
      lastTopIdRef.current = null;
      return;
    }
    const newTop = leads[0];
    const previousTopId = lastTopIdRef.current;
    lastTopIdRef.current = newTop._id;
    // Skip the first paint — there's no "previous" yet, so it isn't a new arrival.
    if (previousTopId === null) return;
    if (previousTopId === newTop._id) return;

    setAnnouncement(`Nueva señal: ${newTop.matchedKeyword}`);

    if (!topItemRef.current) return;
    const scroller = scrollerRef.current;
    const nearTop = !scroller || scroller.scrollTop < NEAR_TOP_PX;
    // Don't yank a user who's reading deep in the list. They keep their place;
    // SR users still hear the announcement.
    if (!nearTop) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    topItemRef.current.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [leads]);

  if (leads === undefined) {
    return (
      <div className="h-full overflow-y-auto pr-1" aria-busy="true" aria-label="Cargando señales">
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders, no identity.
              key={i}
              className="flex animate-pulse items-center gap-3 rounded-2xl border border-surface-border bg-surface p-3"
            >
              <div className="h-9 w-9 shrink-0 rounded-lg bg-surface-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-surface-muted" />
                <div className="h-2.5 w-1/2 rounded bg-surface-muted" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div ref={scrollerRef} className="h-full overflow-y-auto pr-1">
        <Card variant="surface" className="space-y-2 text-center">
          <p className="text-sm font-medium text-zinc-900">Aún no hay señales nuevas.</p>
          <p className="text-xs text-zinc-500">
            Las leads aparecerán aquí cuando Hebra detecte posts relevantes.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div ref={scrollerRef} className="h-full overflow-y-auto pr-1">
      {/* SR-only live region: announces new arrivals without disturbing sighted users. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <ul className="space-y-2">
        {leads.map((lead, idx) => {
          const isActive = lead._id === selectedLeadId;
          // `feedByUser` returns plain `Doc<"leads">` (no joined post).
          // The row surfaces score + matched keyword + relative scoredAt time.
          // Post title and subreddit live in the detail pane.
          return (
            <li key={lead._id} ref={idx === 0 ? topItemRef : undefined}>
              <button
                type="button"
                onClick={() => onSelect(lead._id)}
                aria-current={isActive ? "true" : undefined}
                aria-label={`Lead, puntuación ${lead.score}, ${lead.matchedKeyword}`}
                className={`group relative block w-full rounded-2xl border p-3 text-left transition ${
                  isActive
                    ? "border-zinc-900/15 bg-surface shadow-sm"
                    : "border-surface-border bg-surface hover:bg-surface-muted"
                }`}
              >
                {/* Active rail: a thin tinted bar on the left edge, inset so it follows the rounded corner. */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-zinc-900"
                  />
                )}
                <div className="flex items-start gap-3">
                  <ScoreBadge tier={lead.tier} score={lead.score} compact />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {lead.matchedKeyword}
                      </p>
                      {!lead.read && (
                        <span
                          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-tier-hot"
                          aria-label="No leída"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{lead.reasoning}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-400">
                      {formatRelativeTime(lead.scoredAt)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
