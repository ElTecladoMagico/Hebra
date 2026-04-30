"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function DashboardPage() {
  const user = useQuery(api.users.current);

  if (user === undefined) {
    return <p>Cargando…</p>;
  }
  if (user === null) {
    return <p>Sincronizando tu cuenta… (espera unos segundos y refresca)</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Bienvenido, {user.name ?? user.email}</h1>
      <p className="mt-2 text-zinc-600">
        Plan actual: <strong>{user.tier}</strong>
      </p>
      <p className="mt-4 text-zinc-500">
        Aquí aparecerá tu Bandeja de Señales cuando crees una campaña.
      </p>
    </div>
  );
}
