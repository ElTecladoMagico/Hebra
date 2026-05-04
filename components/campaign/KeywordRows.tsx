"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface KeywordRowsProps {
  keywords: string[];
  onChange: (next: string[]) => void;
  // Reserved for future AI suggestion. The form passes the offering text so
  // the eventual Gemini call has context about what to generate keywords for.
  // TODO(plan-4): wire this up to a Convex action that asks Gemini for
  // keyword suggestions based on the offering. Server-side helper exists
  // in lib/quota.ts (op: "keyword").
  offering?: string;
}

export function KeywordRows({ keywords, onChange }: KeywordRowsProps) {
  // Always render at least one row so the user has something to type into.
  const rows = keywords.length === 0 ? [""] : keywords;

  const updateAt = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const removeAt = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    // Keep state non-empty so the rendered list always shows something.
    onChange(next.length === 0 ? [""] : next);
  };

  const addRow = () => {
    onChange([...rows, ""]);
  };

  return (
    <Card variant="surface" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Keywords</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Palabras o frases cortas que indican intención de compra. Una por fila.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled title="Próximamente">
          ✨ Generar con IA
        </Button>
      </div>

      <ul className="space-y-2">
        {rows.map((kw, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are intentionally index-keyed; reordering not supported.
          <li key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={kw}
              onChange={(e) => updateAt(index, e.target.value)}
              placeholder="ej. recomendar agencia SEO"
              className="flex-1 rounded-xl border border-surface-border bg-surface px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm transition focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
            />
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label="Eliminar keyword"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-900/5 hover:text-zinc-700"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <Button type="button" variant="secondary" size="sm" onClick={addRow}>
        + Añadir keyword
      </Button>
    </Card>
  );
}
