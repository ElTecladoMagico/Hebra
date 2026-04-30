import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hebra",
  description: "Encuentra clientes en Reddit hablando español.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
