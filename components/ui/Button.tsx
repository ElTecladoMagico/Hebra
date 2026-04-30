import type { ButtonHTMLAttributes } from "react";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
