"use client";
import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function DashboardPage() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const user = useQuery(api.users.current);

  // Client-side user sync: guarantees a row exists in Convex regardless of
  // webhook delivery state. Idempotent — safe to call on every mount.
  useEffect(() => {
    if (!isAuthenticated) return;
    storeUser().catch((err) => {
      console.error("[dashboard] failed to sync user to Convex:", err);
    });
  }, [isAuthenticated, storeUser]);

  if (user === undefined) {
    return <p>Cargando…</p>;
  }
  if (user === null) {
    return <p>Sincronizando tu cuenta…</p>;
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
