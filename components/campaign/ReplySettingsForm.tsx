"use client";

import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";

export interface ReplySettings {
  tone: "casual" | "professional" | "friendly";
  length: "short" | "medium" | "long";
  style: "value-first" | "value-mention" | "direct-offer";
  includeCTA: boolean;
  personalize: boolean;
  includePhrases?: string;
  replyDialect: "es-neutral" | "es-ES" | "es-LATAM";
}

interface ReplySettingsFormProps {
  value: ReplySettings;
  onChange: (next: ReplySettings) => void;
}

interface Option<T extends string> {
  value: T;
  label: string;
}

const TONE_OPTIONS: Option<ReplySettings["tone"]>[] = [
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Profesional" },
  { value: "friendly", label: "Cercano" },
];

const LENGTH_OPTIONS: Option<ReplySettings["length"]>[] = [
  { value: "short", label: "Corto" },
  { value: "medium", label: "Medio" },
  { value: "long", label: "Largo" },
];

const STYLE_OPTIONS: Option<ReplySettings["style"]>[] = [
  { value: "value-first", label: "Aporta valor" },
  { value: "value-mention", label: "Valor + mención" },
  { value: "direct-offer", label: "Oferta directa" },
];

const DIALECT_OPTIONS: Option<ReplySettings["replyDialect"]>[] = [
  { value: "es-neutral", label: "Neutral" },
  { value: "es-ES", label: "España (es-ES)" },
  { value: "es-LATAM", label: "LATAM" },
];

interface ButtonGroupProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}

function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: ButtonGroupProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex w-full overflow-hidden rounded-lg border border-surface-border"
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        const isFirst = idx === 0;
        const isLast = idx === options.length - 1;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition ${
              active ? "bg-zinc-900 text-white" : "bg-surface text-zinc-700 hover:bg-surface-muted"
            } ${isFirst ? "" : "border-l border-surface-border"} ${
              isFirst ? "rounded-l-[7px]" : ""
            } ${isLast ? "rounded-r-[7px]" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-surface-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-surface-border text-zinc-900 focus:ring-zinc-900/20"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-zinc-900">{label}</span>
        {description && <span className="block text-xs text-zinc-500">{description}</span>}
      </span>
    </label>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-zinc-900">{label}</span>
      {children}
    </div>
  );
}

export function ReplySettingsForm({ value, onChange }: ReplySettingsFormProps) {
  const set = <K extends keyof ReplySettings>(key: K, v: ReplySettings[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <Card variant="surface" className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Configuración de respuestas</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Define el estilo del borrador que Hebra generará para cada lead.
        </p>
      </div>

      <Field label="Tono">
        <ButtonGroup
          ariaLabel="Tono"
          options={TONE_OPTIONS}
          value={value.tone}
          onChange={(v) => set("tone", v)}
        />
      </Field>

      <Field label="Longitud">
        <ButtonGroup
          ariaLabel="Longitud"
          options={LENGTH_OPTIONS}
          value={value.length}
          onChange={(v) => set("length", v)}
        />
      </Field>

      <Field label="Estilo">
        <ButtonGroup
          ariaLabel="Estilo"
          options={STYLE_OPTIONS}
          value={value.style}
          onChange={(v) => set("style", v)}
        />
        {value.style === "direct-offer" && (
          <p
            role="alert"
            className="mt-1 rounded-lg bg-tier-hot-bg px-3 py-2 text-xs text-tier-hot ring-1 ring-tier-hot/25"
          >
            ⚠️ Esta opción tiene mayor riesgo de downvotes/spam reports en Reddit. Úsala solo si el
            post pide servicios explícitamente.
          </p>
        )}
      </Field>

      <Field label="Dialecto">
        <ButtonGroup
          ariaLabel="Dialecto"
          options={DIALECT_OPTIONS}
          value={value.replyDialect}
          onChange={(v) => set("replyDialect", v)}
        />
      </Field>

      <div className="space-y-1">
        <Toggle
          checked={value.includeCTA}
          onChange={(v) => set("includeCTA", v)}
          label="Incluir llamada a la acción"
          description="Añade un cierre con invitación a contactar (DM, web, etc)."
        />
        <Toggle
          checked={value.personalize}
          onChange={(v) => set("personalize", v)}
          label="Personalizar con detalles del post"
          description="Cita aspectos concretos del post original para sonar humano."
        />
      </div>

      <Field label="Frases que siempre incluir (opcional)">
        <Textarea
          rows={2}
          value={value.includePhrases ?? ""}
          onChange={(e) => set("includePhrases", e.target.value)}
          placeholder="ej. soy parte del equipo de…, sin compromiso"
        />
      </Field>
    </Card>
  );
}
