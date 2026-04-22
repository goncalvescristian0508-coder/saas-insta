import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoPost",
  description: "Automatize e agende suas postagens no Instagram com AutoPost.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
