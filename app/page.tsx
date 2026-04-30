import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-5xl font-bold">Hebra</h1>
      <p className="mt-4 text-lg">Tira de la hebra. Encuentra clientes en Reddit.</p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/sign-up"
          className="rounded-md bg-black px-6 py-3 text-white hover:bg-zinc-800"
        >
          Empezar gratis
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-black px-6 py-3 hover:bg-zinc-100"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
