import "../globals.css";
import Sidebar from "@/components/Sidebar";
import PushSetup from "@/components/PushSetup";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
      <PushSetup />
    </div>
  );
}
