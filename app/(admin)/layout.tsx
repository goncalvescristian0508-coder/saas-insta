import "../globals.css";
import AdminSidebar from "@/components/AdminSidebar";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-container">
      <AdminSidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
