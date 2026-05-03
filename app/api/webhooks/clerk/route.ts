import { Webhook } from "svix";
import { headers } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Server misconfigured", { status: 500 });

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(secret);
  let evt: any;
  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  // Extract the user object regardless of event type:
  // - user.created / user.updated: user fields are at evt.data
  // - session.created: user is nested at evt.data.user
  // This makes the sync robust to event subscription drift and recovers
  // pre-existing Clerk users on their next sign-in.
  const userPayload =
    evt.type === "user.created" || evt.type === "user.updated"
      ? evt.data
      : evt.type === "session.created"
        ? evt.data?.user
        : null;

  if (userPayload) {
    const { id, email_addresses, first_name, last_name } = userPayload;
    if (!id) return new Response("No user id in payload", { status: 400 });
    const email = email_addresses?.[0]?.email_address;
    if (!email) return new Response("No email", { status: 400 });
    const name = [first_name, last_name].filter(Boolean).join(" ") || undefined;
    await convex.mutation(api.users.createOrUpdate, {
      clerkUserId: id,
      email,
      name,
    });
  }

  return new Response("OK", { status: 200 });
}
