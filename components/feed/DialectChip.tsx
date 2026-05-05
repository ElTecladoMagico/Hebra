import { Badge } from "../ui/Badge";

type Dialect = "es-ES" | "es-LATAM" | "es-neutral";

const LABEL: Record<Dialect, string> = {
  "es-ES": "🇪🇸 España",
  "es-LATAM": "🌎 LATAM",
  "es-neutral": "🌐 Neutral",
};

export function DialectChip({ dialect }: { dialect: Dialect | undefined }) {
  if (!dialect) return null;
  return <Badge variant="neutral">{LABEL[dialect]}</Badge>;
}
