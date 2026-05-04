"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

type CampaignStatus = Doc<"campaigns">["status"];

const STATUS_LABEL: Record<CampaignStatus, string> = {
  active: "Activa",
  paused: "En pausa",
  archived: "Archivada",
};

function statusBadge(status: CampaignStatus) {
  if (status === "active") return <Badge variant="success">{STATUS_LABEL.active}</Badge>;
  if (status === "paused") return <Badge>{STATUS_LABEL.paused}</Badge>;
  return <Badge variant="cold">{STATUS_LABEL.archived}</Badge>;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface CampaignRowProps {
  campaign: Doc<"campaigns">;
}

function CampaignRow({ campaign }: CampaignRowProps) {
  const setStatus = useMutation(api.campaigns.setStatus);
  const [updating, setUpdating] = useState<CampaignStatus | null>(null);

  async function handleStatus(next: CampaignStatus, id: Id<"campaigns">) {
    setUpdating(next);
    try {
      await setStatus({ campaignId: id, status: next });
    } finally {
      setUpdating(null);
    }
  }

  const truncatedOffering =
    campaign.offering.length > 140 ? `${campaign.offering.slice(0, 140)}…` : campaign.offering;

  return (
    <Card variant="surface" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-zinc-900">{campaign.name}</h3>
            {statusBadge(campaign.status)}
          </div>
          <p className="text-sm text-zinc-600">{truncatedOffering}</p>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">{formatDate(campaign.createdAt)}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-3 text-xs text-zinc-500">
        <span>
          {campaign.subredditSlugs.length} subreddits · {campaign.keywords.length} keywords
        </span>
        <div className="flex items-center gap-1">
          {campaign.status === "active" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={updating !== null}
              onClick={() => handleStatus("paused", campaign._id)}
            >
              Pausar
            </Button>
          )}
          {campaign.status === "paused" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={updating !== null}
              onClick={() => handleStatus("active", campaign._id)}
            >
              Activar
            </Button>
          )}
          {campaign.status !== "archived" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={updating !== null}
              onClick={() => handleStatus("archived", campaign._id)}
            >
              Archivar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card variant="surface" className="space-y-3 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">Aún no tienes campañas</h2>
      <p className="mx-auto max-w-sm text-sm text-zinc-500">
        Crea tu primera campaña para que Hebra empiece a buscar hilos relevantes en Reddit.
      </p>
      <div className="pt-2">
        <Link href="/campaigns/new">
          <Button variant="primary">+ Nueva campaña</Button>
        </Link>
      </div>
    </Card>
  );
}

export default function CampaignsPage() {
  const campaigns = useQuery(api.campaigns.listMine);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Campañas</h1>
          <p className="text-sm text-zinc-500">
            Gestiona tus campañas activas, en pausa y archivadas.
          </p>
        </div>
        <Link href="/campaigns/new">
          <Button variant="primary">+ Nueva campaña</Button>
        </Link>
      </header>

      {campaigns === undefined ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c._id}>
              <CampaignRow campaign={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
