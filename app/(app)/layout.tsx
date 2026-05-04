import { NavLink } from "@/components/chrome/NavLink";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ "--topbar-h": "4.25rem" } as React.CSSProperties}>
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-zinc-900">
            Hebra
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink href="/feed">Bandeja</NavLink>
            <NavLink href="/campaigns">Campañas</NavLink>
          </nav>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-8">{children}</main>
    </div>
  );
}
