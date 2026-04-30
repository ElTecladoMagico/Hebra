import "./globals.css";
import type { Metadata } from "next";
import { ConvexClerkProvider } from "@/components/providers/ConvexClerkProvider";

export const metadata: Metadata = {
  title: "Hebra",
  description: "Encuentra clientes en Reddit hablando español.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ConvexClerkProvider>{children}</ConvexClerkProvider>
      </body>
    </html>
  );
}
