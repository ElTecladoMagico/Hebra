"use client";

import { api } from "@/convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Dashboard is a routing hub, not a destination.
 *
 * 1. Sync the Clerk identity to a Convex `users` row (idempotent — see
 *    `users.store`). This guarantees a row exists even if the Clerk webhook
 *    lagged or missed.
 * 2. Once we know the user and their campaigns, route:
 *    - no campaigns yet → /onboarding
 *    - has campaigns    → /feed (Bandeja de Señales)
 */
export default function DashboardPage() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const router = useRouter();
  const user = useQuery(api.users.current);
  const campaigns = useQuery(api.campaigns.listMine);

  useEffect(() => {
    if (!isAuthenticated) return;
    storeUser().catch((err) => {
      console.error("[dashboard] failed to sync user to Convex:", err);
    });
  }, [isAuthenticated, storeUser]);

  useEffect(() => {
    // Wait for both queries to resolve before deciding where to send the user.
    if (user === null || user === undefined) return;
    if (campaigns === undefined) return;
    if (campaigns.length === 0) {
      router.replace("/onboarding");
    } else {
      router.replace("/feed");
    }
  }, [user, campaigns, router]);

  return <p className="text-sm text-zinc-500">Cargando…</p>;
}
