"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useState } from "react";
import { Card } from "../../ui/Card";
import { DialectChip } from "../DialectChip";
import { ScoreBadge } from "../ScoreBadge";

const POST_BODY_PREVIEW_LINES = 6;
const POST_BODY_PREVIEW_CHARS = 280;

interface PostBlockProps {
  post: Doc<"redditPosts"> | null;
  lead: Pick<Doc<"leads">, "tier" | "score" | "reasoning">;
}

/**
 * Reddit post card: subreddit + relative time + dialect chip + score badge,
 * title, body with "Mostrar más" toggle, optional reasoning hint, and the
 * "Ver en Reddit ↗" link. Owns its own `bodyExpanded` state — purely visual.
 */
export function PostBlock({ post, lead }: PostBlockProps) {
  const [bodyExpanded, setBodyExpanded] = useState(false);

  return (
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
  );
}
