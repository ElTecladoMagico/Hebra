import { FeedShell } from "@/components/feed/FeedShell";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Deep-link route. Pre-selects a lead from the URL.
 *
 * Note: in Next.js 15, `params` is a Promise. We await it here in the server
 * component and pass the resolved id to the client `FeedShell`. Convex will
 * reject malformed ids at the query level — no runtime guard needed here.
 */
export default async function FeedDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  return <FeedShell preselectedLeadId={leadId as Id<"leads">} />;
}
