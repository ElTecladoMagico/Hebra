import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

// TODO(plan-4): add a language preference selector here. Schema field
// `users.languagePreference` defaults to "es-neutral" so deferring is safe.
export default function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center">
      <Card variant="glass" padded className="w-full space-y-5 px-7 py-8">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Bienvenido</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Empecemos a tejer tu primera red de leads
          </h1>
          <p className="text-sm text-zinc-600">
            Hebra escucha Reddit en español y te trae los hilos donde tu producto o servicio puede
            aportar. Crea una campaña para empezar a recibir señales calientes en tu bandeja.
          </p>
        </div>

        <ul className="space-y-2 text-sm text-zinc-700">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-zinc-400">
              1.
            </span>
            <span>Define qué ofreces y a qué subreddits apuntar.</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-zinc-400">
              2.
            </span>
            <span>Hebra puntúa cada hilo (Hot / Warm / Cold).</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-zinc-400">
              3.
            </span>
            <span>Recibe un borrador de respuesta en tu tono.</span>
          </li>
        </ul>

        <div className="flex justify-end pt-2">
          <Link href="/campaigns/new">
            <Button variant="primary" size="lg">
              Crear mi primera campaña
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
