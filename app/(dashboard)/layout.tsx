import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar: visible only on md+ */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      {/* Main content: offset by sidebar on md+, full width on mobile */}
      <main className="md:ml-60 min-h-screen pb-20 md:pb-0">{children}</main>
      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
