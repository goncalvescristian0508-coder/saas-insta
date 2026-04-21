import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayne Automations",
  description: "Operações digitais Wayne — automação e conteúdo com padrão Gotham.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
