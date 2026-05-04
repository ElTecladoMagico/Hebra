"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { KeywordRows } from "./KeywordRows";
import { type ReplySettings, ReplySettingsForm } from "./ReplySettingsForm";
import { SubredditPicker } from "./SubredditPicker";

const OFFERING_MAX_LENGTH = 300;

const DEFAULT_REPLY: ReplySettings = {
  tone: "friendly",
  length: "medium",
  style: "value-first",
  includeCTA: false,
  personalize: true,
  includePhrases: "",
  replyDialect: "es-neutral",
};

export function CampaignForm() {
  const router = useRouter();
  const create = useMutation(api.campaigns.createCampaign);

  const [name, setName] = useState("");
  const [offering, setOffering] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [reply, setReply] = useState<ReplySettings>(DEFAULT_REPLY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const offeringCount = offering.length;
  const offeringOver = offeringCount > OFFERING_MAX_LENGTH;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const cleanedKeywords = keywords.map((k) => k.trim()).filter((k) => k.length > 0);
      const cleanedPhrases = reply.includePhrases?.trim();
      await create({
        name: name.trim() === "" ? "Campaña sin nombre" : name.trim(),
        offering: offering.trim(),
        websiteUrl: websiteUrl.trim() === "" ? undefined : websiteUrl.trim(),
        keywords: cleanedKeywords,
        subredditSlugs: subreddits,
        replySettings: {
          ...reply,
          includePhrases: cleanedPhrases && cleanedPhrases.length > 0 ? cleanedPhrases : undefined,
        },
      });
      router.push("/feed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Nueva campaña</h1>
        <p className="text-sm text-zinc-500">
          Cuéntale a Hebra qué ofreces y dónde buscar. Podrás afinar después.
        </p>
      </header>

      <Card variant="surface" className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="campaign-name" className="block text-sm font-medium text-zinc-900">
            Nombre de la campaña
          </label>
          <input
            id="campaign-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaña sin nombre"
            className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm transition focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="campaign-offering" className="block text-sm font-medium text-zinc-900">
              ¿Qué ofreces?
            </label>
            <span
              id="campaign-offering-counter"
              className={`text-xs tabular-nums ${offeringOver ? "text-tier-hot" : "text-zinc-400"}`}
            >
              {offeringCount}/{OFFERING_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            id="campaign-offering"
            rows={3}
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            placeholder="ej. Servicio SEO local para restaurantes en España"
            required
            aria-invalid={offeringOver}
            aria-describedby="campaign-offering-counter"
          />
          <p className="text-xs text-zinc-500">
            Sé específico: tipo de cliente, geografía, problema que resuelves.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="campaign-website" className="block text-sm font-medium text-zinc-900">
            Web (opcional)
          </label>
          <input
            id="campaign-website"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://tudominio.com"
            className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm transition focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
          />
        </div>
      </Card>

      <KeywordRows keywords={keywords} onChange={setKeywords} offering={offering} />

      <SubredditPicker value={subreddits} onChange={setSubreddits} />

      <ReplySettingsForm value={reply} onChange={setReply} />

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-tier-hot-bg px-4 py-3 text-sm text-tier-hot ring-1 ring-tier-hot/25"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={submitting || offeringOver}>
          {submitting ? "Creando…" : "Crear y empezar a buscar"}
        </Button>
      </div>
    </form>
  );
}
