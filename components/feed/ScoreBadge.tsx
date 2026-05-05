import { Badge } from "../ui/Badge";

type Tier = "hot" | "warm" | "cold";

const LABEL: Record<Tier, string> = {
  hot: "Caliente",
  warm: "Tibia",
  cold: "Fría",
};

interface ScoreBadgeProps {
  tier: Tier;
  score: number;
  /**
   * Compact variant used in dense list rows: just the number, tinted to the
   * tier color, with the tier label only available via aria-label. The full
   * label badge is used in the detail header.
   */
  compact?: boolean;
}

const COMPACT_TIER: Record<Tier, string> = {
  hot: "text-tier-hot",
  warm: "text-tier-warm",
  cold: "text-tier-cold",
};

export function ScoreBadge({ tier, score, compact = false }: ScoreBadgeProps) {
  if (compact) {
    return (
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-sm font-bold tabular-nums leading-none ${COMPACT_TIER[tier]}`}
        aria-label={`${LABEL[tier]}, puntuación ${score}`}
      >
        {score}
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl font-bold tabular-nums leading-none text-zinc-900">{score}</span>
      <Badge variant={tier}>{LABEL[tier]}</Badge>
    </div>
  );
}
