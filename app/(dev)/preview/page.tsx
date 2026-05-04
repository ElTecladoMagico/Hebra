import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";

/**
 * Visual smoke harness for the Hebra Liquid Glass design system.
 * Temporary route — delete at end of Plan 3.
 */
export default function PreviewPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Hebra · Design System
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
          Liquid Glass primitives
        </h1>
        <p className="max-w-xl text-sm text-zinc-600">
          Chrome surfaces use glass; data and forms stay opaque. Static, neutral, legibility-first.
          Refraction skipped (Safari ~30% on ES).
        </p>
      </header>

      {/* Cards */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Card variants
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card variant="surface">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">surface</p>
              <p className="text-sm text-zinc-700">
                Opaque companion. Use for lead cards, form panels, dense data tables. Readable,
                low-noise.
              </p>
            </div>
          </Card>
          <Card variant="glass">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-700">glass</p>
              <p className="text-sm text-zinc-800">
                Chrome surface. Use for sidebars, command palettes, modals. Reduced transparency
                falls back to solid surface + ring.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* Badges */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Badge variants
        </h2>
        <Card variant="surface" padded>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>default</Badge>
            <Badge variant="hot">hot</Badge>
            <Badge variant="warm">warm</Badge>
            <Badge variant="cold">cold</Badge>
            <Badge variant="neutral">neutral</Badge>
            <Badge variant="success">success</Badge>
          </div>
        </Card>
      </section>

      {/* Buttons */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Button variants × sizes
        </h2>
        <Card variant="surface" padded>
          <div className="flex flex-col gap-4">
            {(["sm", "md", "lg"] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-3">
                <span className="w-8 text-xs font-mono uppercase tracking-wider text-zinc-400">
                  {size}
                </span>
                <Button variant="primary" size={size}>
                  Primary
                </Button>
                <Button variant="secondary" size={size}>
                  Secondary
                </Button>
                <Button variant="ghost" size={size}>
                  Ghost
                </Button>
                <Button variant="glass" size={size}>
                  Glass
                </Button>
                <Button variant="primary" size={size} disabled>
                  Disabled
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Textarea */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Textarea (opaque, never glass)
        </h2>
        <Card variant="surface" padded>
          <div className="flex flex-col gap-2">
            <label htmlFor="preview-textarea" className="text-sm font-medium text-zinc-800">
              Mensaje de prueba
            </label>
            <Textarea
              id="preview-textarea"
              rows={4}
              placeholder="Escribe algo para probar legibilidad y focus ring…"
            />
            <p className="text-xs text-zinc-500">
              Form fields are intentionally opaque per Decisión A2 — legibilidad primero.
            </p>
          </div>
        </Card>
      </section>
    </main>
  );
}
