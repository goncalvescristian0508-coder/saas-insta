import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoPost",
  description: "Automatize e agende suas postagens no Instagram com AutoPost.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AutoPost",
  },
  icons: {
    apple: "/logo-notification.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#080A10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
