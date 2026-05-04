import type { HTMLAttributes } from "react";

type Variant = "default" | "hot" | "warm" | "cold" | "neutral" | "success";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const VARIANT: Record<Variant, string> = {
  default: "bg-zinc-100 text-zinc-700",
  hot: "bg-tier-hot-bg text-tier-hot ring-1 ring-tier-hot/25",
  warm: "bg-tier-warm-bg text-tier-warm ring-1 ring-tier-warm/25",
  cold: "bg-tier-cold-bg text-tier-cold",
  neutral: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
};

export function Badge({ variant = "default", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}
