"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { LeadDetail } from "./LeadDetail";
import { LeadList } from "./LeadList";

interface FeedShellProps {
  preselectedLeadId?: Id<"leads">;
}

/**
 * Two-pane shell: list on the left, detail on the right.
 *
 * Mobile (Mail.app pattern): list is the default view, the detail replaces it
 * once a lead is selected. A "← Volver" button bounces back. At `md:` and up,
 * both panes are visible side-by-side.
 *
 * Sticky panes: each pane is its own scrollable column inside a fixed-height
 * container, so the topbar stays put and the list / detail scroll independently.
 */
export function FeedShell({ preselectedLeadId }: FeedShellProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | undefined>(preselectedLeadId);
  const leads = useQuery(api.leads.feedByUser, {});

  const showListOnMobile = !selectedLeadId;
  const showDetailOnMobile = !!selectedLeadId;

  return (
    <div
      className="flex gap-4"
      // Layout adds pt-8 (2rem) + pb-16 (4rem) around <main>, plus the topbar.
      // Subtract all of it so the panes stop above the viewport edge cleanly.
      style={{ height: "calc(100vh - var(--topbar-h) - 6rem)" }}
    >
      {/* List pane */}
      <aside
        className={`w-full md:w-[360px] md:shrink-0 ${
          showListOnMobile ? "block" : "hidden md:block"
        }`}
        aria-label="Lista de señales"
      >
        <div className="flex h-full flex-col">
          <div className="mb-3 flex items-baseline justify-between">
            <h1 className="text-lg font-bold tracking-tight text-zinc-900">Bandeja</h1>
            {leads && leads.length > 0 && (
              <span className="text-xs text-zinc-500">
                {leads.length} {leads.length === 1 ? "señal" : "señales"}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <LeadList leads={leads} selectedLeadId={selectedLeadId} onSelect={setSelectedLeadId} />
          </div>
        </div>
      </aside>

      {/* Detail pane */}
      <section
        className={`min-w-0 flex-1 ${showDetailOnMobile ? "block" : "hidden md:block"}`}
        aria-label="Detalle de la señal"
      >
        <div className="h-full overflow-y-auto pr-1">
          {selectedLeadId ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLeadId(undefined)}
                className="mb-3 md:hidden"
              >
                ← Volver
              </Button>
              <LeadDetail
                key={selectedLeadId}
                leadId={selectedLeadId}
                onArchived={() => setSelectedLeadId(undefined)}
              />
            </>
          ) : (
            <EmptySelectionState />
          )}
        </div>
      </section>
    </div>
  );
}

function EmptySelectionState() {
  return (
    <div className="flex h-full items-center justify-center">
      <Card variant="surface" className="max-w-sm space-y-2 text-center">
        <p className="text-sm font-medium text-zinc-900">Selecciona una señal</p>
        <p className="text-xs text-zinc-500">
          Elige un hilo de la lista para ver el post completo y redactar tu respuesta.
        </p>
      </Card>
    </div>
  );
}
