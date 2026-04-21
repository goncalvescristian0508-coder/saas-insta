import "../globals.css";
import Sidebar from "@/components/Sidebar";
import GothamBackdrop from "@/components/GothamBackdrop";
import GothamAtmosphere from "@/components/GothamAtmosphere";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GothamBackdrop />
      <GothamAtmosphere />
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </>
  );
}
