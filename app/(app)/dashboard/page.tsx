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
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const router = useRouter();
  // Gate queries on auth — without this, useQuery fires before the Convex
  // client finalizes the JWT and returns undefined permanently until a
  // manual reload. The "skip" sentinel is the canonical Convex pattern.
  // See: https://docs.convex.dev/client/react#skipping-an-argument
  const user = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  const campaigns = useQuery(
    api.campaigns.listMine,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    storeUser().catch((err) => {
      console.error("[dashboard] failed to sync user to Convex:", err);
    });
  }, [isAuthenticated, storeUser]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Wait for both queries to resolve before deciding where to send the user.
    if (user === undefined || campaigns === undefined) return;
    // user === null means storeUser hasn't landed yet — wait for the
    // reactive update from useQuery to advance.
    if (user === null) return;
    if (campaigns.length === 0) {
      router.replace("/onboarding");
    } else {
      router.replace("/feed");
    }
  }, [isAuthenticated, user, campaigns, router]);

  // Distinguish auth-still-validating from data-still-loading for clarity.
  if (isLoading) return <p className="text-sm text-zinc-500">Conectando…</p>;
  return <p className="text-sm text-zinc-500">Cargando…</p>;
}
