import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ count: runnersOnline }, { count: pendingApprovals }] = await Promise.all([
    supabase.from("runners").select("id", { count: "exact", head: true }).eq("status", "online"),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <div className="min-h-screen bg-background bg-grid bg-radial-glow flex">
      <DashboardSidebar userEmail={user.email ?? null} />
      <div className="flex-1 flex flex-col">
        <DashboardTopbar
          runnersOnline={runnersOnline ?? 0}
          pendingApprovals={pendingApprovals ?? 0}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
