import { Activity } from "lucide-react";

export function DashboardTopbar({
  runnersOnline,
  pendingApprovals,
}: {
  runnersOnline: number;
  pendingApprovals: number;
}) {
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/60 backdrop-blur-sm">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-foreground/60">
        <Activity className="w-4 h-4 text-primary" />
        <span>// Vibefence Hypervisor</span>
      </div>
      <div className="flex items-center gap-4 text-xs font-mono uppercase tracking-wider">
        <div className="flex items-center gap-2">
          <span
            className={
              runnersOnline > 0
                ? "w-2 h-2 rounded-full bg-primary shadow-glow shadow-primary"
                : "w-2 h-2 rounded-full bg-foreground/30"
            }
          />
          <span className="text-foreground/60">
            {runnersOnline} runner{runnersOnline === 1 ? "" : "s"} online
          </span>
        </div>
        {pendingApprovals > 0 && (
          <div className="flex items-center gap-2 text-primary">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>{pendingApprovals} approval{pendingApprovals === 1 ? "" : "s"} pending</span>
          </div>
        )}
      </div>
    </header>
  );
}
