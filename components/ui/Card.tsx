import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "surface";
  padded?: boolean;
}

export function Card({ variant = "surface", padded = true, className = "", ...props }: CardProps) {
  const base = variant === "glass" ? "glass" : "surface-card";
  const padding = padded ? "p-5" : "";
  return <div className={`${base} ${padding} ${className}`.trim()} {...props} />;
}
