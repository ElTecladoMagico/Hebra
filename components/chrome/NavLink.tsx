"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  // Match the exact route or any nested path under it (so /campaigns/new
  // still highlights the "Campañas" tab).
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  const base =
    "inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20";
  const styles = isActive
    ? "bg-zinc-900/5 text-zinc-900"
    : "text-zinc-700 hover:bg-zinc-900/5 hover:text-zinc-900";

  return (
    <Link href={href} className={`${base} ${styles}`}>
      {children}
    </Link>
  );
}
