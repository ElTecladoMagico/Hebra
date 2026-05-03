export type Dialect = "es-neutral" | "es-ES" | "es-LATAM";

const ES_MARKERS = /\b(vosotros|vosotras|vuestro|vuestra|tío|tía|joder|guay|vale)\b/i;
const LATAM_MARKERS = /\b(vos|sos|tenés|querés|sabés|podés|che|órale|chido|bacán|chévere)\b/i;

export function detectDialect(text: string): Dialect {
  const hasES = ES_MARKERS.test(text);
  const hasLatam = LATAM_MARKERS.test(text);
  if (hasLatam && !hasES) return "es-LATAM";
  if (hasES && !hasLatam) return "es-ES";
  return "es-neutral";
}
