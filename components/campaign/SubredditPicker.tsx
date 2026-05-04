"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CURATED_SUBREDDITS, type Country, type Hostility } from "@/convex/data/subreddits";

interface SubredditPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

const COUNTRY_FLAG: Record<Country, string> = {
  ES: "🇪🇸",
  MX: "🇲🇽",
  AR: "🇦🇷",
  CO: "🇨🇴",
  CL: "🇨🇱",
  PE: "🇵🇪",
  // No single flag fits a pan-Hispanic community; use a globe.
  "PAN-HISPANO": "🌐",
};

function hostilityBadge(level: Hostility) {
  if (level === "high") return <Badge variant="hot">Hostil</Badge>;
  if (level === "low") return <Badge variant="success">Amigable</Badge>;
  return <Badge>Neutral</Badge>;
}

export function SubredditPicker({ value, onChange }: SubredditPickerProps) {
  const selected = new Set(value.map((s) => s.toLowerCase()));

  const toggle = (slug: string) => {
    const lower = slug.toLowerCase();
    if (selected.has(lower)) {
      onChange(value.filter((s) => s.toLowerCase() !== lower));
    } else {
      onChange([...value, slug]);
    }
  };

  return (
    <Card variant="surface" className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Subreddits</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">"Hostil"</span> indica subreddits poco
          tolerantes a auto-promo. Empieza con 3–5 amigables/neutrales.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CURATED_SUBREDDITS.map((sub) => {
          const isActive = selected.has(sub.slug.toLowerCase());
          return (
            <li key={sub.slug}>
              <button
                type="button"
                onClick={() => toggle(sub.slug)}
                aria-pressed={isActive}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  isActive
                    ? "border-zinc-900 bg-zinc-900/5 ring-2 ring-zinc-900/10"
                    : "border-surface-border bg-surface hover:bg-surface-muted"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="text-base leading-none">
                    {COUNTRY_FLAG[sub.country]}
                  </span>
                  <span className="truncate font-medium text-zinc-900">r/{sub.slug}</span>
                </span>
                {hostilityBadge(sub.hostility)}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
