import type { Metadata } from "next";
import "../globals.css";
import GothamBackdrop from "@/components/GothamBackdrop";
import GothamAtmosphere from "@/components/GothamAtmosphere";

export const metadata: Metadata = {
  title: "Wayne Automations — Acesso",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GothamBackdrop />
      <GothamAtmosphere />
      {children}
    </>
  );
}
