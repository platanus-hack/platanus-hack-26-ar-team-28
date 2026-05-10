import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Camera,
  FolderTree,
  Gauge,
  Network,
  Server,
  ShieldOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/dashboard/stat-tile";
import { SectionCard } from "@/components/dashboard/section-card";
import { EmptyState } from "@/components/dashboard/empty-state";

interface RecentApproval {
  id: string;
  project_id: string;
  status: string;
  risk_level: string | null;
  requested_action: string;
  created_at: string;
}
interface RecentSnapshot {
  id: string;
  project_id: string;
  type: string;
  status: string;
  size_bytes: number | null;
  created_at: string;
  metadata: { snap_schema?: string; tables?: string[] } | null;
}
interface RecentScan {
  id: string;
  project_id: string;
  status: string;
  target_url: string | null;
  created_at: string;
  started_at: string | null;
}
interface RecentScanEvent {
  id: string;
  scan_id: string;
  agent_name: string;
  event_type: string;
  message: string | null;
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Mark stale runners offline before reading counts (idempotent RPC).
  await supabase.rpc("sweep_stale_runners");

  const [
    { count: projectCount },
    { count: runnersOnline },
    { count: openFindings },
    { count: blockedToday },
    { count: pendingApprovals },
    { count: snapshotsTotal },
    { count: activeScans },
    { data: recentMcp },
    { data: pendingApprovalRows },
    { data: recentSnapshots },
    { data: liveScans },
  ] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("runners").select("id", { count: "exact", head: true }).eq("status", "online"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("mcp_events")
      .select("id", { count: "exact", head: true })
      .eq("decision", "block")
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("snapshots").select("id", { count: "exact", head: true }),
    supabase
      .from("scans")
      .select("id", { count: "exact", head: true })
      .in("status", ["running", "queued"]),
    supabase
      .from("mcp_events")
      .select("id, tool_name, decision, source_type, action_summary, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("approvals")
      .select("id, project_id, status, risk_level, requested_action, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<RecentApproval[]>(),
    supabase
      .from("snapshots")
      .select("id, project_id, type, status, size_bytes, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<RecentSnapshot[]>(),
    supabase
      .from("scans")
      .select("id, project_id, status, target_url, created_at, started_at")
      .in("status", ["running", "queued"])
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<RecentScan[]>(),
  ]);

  // For each running scan, pull the most-recent agent events.
  const liveScanEvents: Record<string, RecentScanEvent[]> = {};
  if (liveScans && liveScans.length > 0) {
    const scanIds = liveScans.map((s) => s.id);
    const { data: events } = await supabase
      .from("scan_events")
      .select("id, scan_id, agent_name, event_type, message, created_at")
      .in("scan_id", scanIds)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<RecentScanEvent[]>();
    if (events) {
      for (const e of events) {
        liveScanEvents[e.scan_id] ??= [];
        if (liveScanEvents[e.scan_id].length < 6) liveScanEvents[e.scan_id].push(e);
      }
    }
  }

  const trustGatewayOnline = (runnersOnline ?? 0) > 0;

  return (
    <div className="container py-8 max-w-[1400px] space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-2">
            // Vibefence Command Center
          </p>
          <h1 className="font-sentient text-4xl text-foreground">
            Tu IA tiene root. Vibefence se lo quita.
          </h1>
          <p className="font-mono text-xs text-foreground/50 mt-2 max-w-2xl">
            Una plataforma. Tres pilares: identity y DLP en runtime para tus agentes de IA, red-team agéntico verificado para el código que escriben, y reversibilidad de un solo clic para los cambios de alto impacto.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">+ Nuevo proyecto</Link>
        </Button>
      </div>

      {/* PRD §11.1 sec 1 — 8 stat tiles. Pillar coloring on the 6 most relevant. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Projects mapped" value={projectCount ?? 0} icon={FolderTree} hint="local + verified" />
        <StatTile label="Runners online" value={runnersOnline ?? 0} icon={Server} hint="paired machines" />
        <StatTile
          label="Tool gateway"
          value={trustGatewayOnline ? "Online" : "Offline"}
          icon={Network}
          pillar={1}
          hint="live coding railguards"
        />
        <StatTile label="Blocked (24h)" value={blockedToday ?? 0} icon={ShieldOff} pillar={1} hint="injected actions" />
        <StatTile label="Active scans" value={activeScans ?? 0} icon={Gauge} pillar={2} hint="red-team in progress" />
        <StatTile label="Open findings" value={openFindings ?? 0} icon={AlertTriangle} pillar={2} hint="verified vulns" />
        <StatTile label="Snapshots" value={snapshotsTotal ?? 0} icon={Camera} pillar={3} hint="reversible state" />
        <StatTile label="Approvals" value={pendingApprovals ?? 0} icon={Bell} pillar={3} hint="awaiting decision" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard
          id="mcp"
          title="Tool Audit Feed"
          subtitle="Every tool call routed through the trust gateway"
          pillar={1}
          action={
            <Link
              href="/projects"
              className="font-mono text-[10px] uppercase tracking-wider text-primary hover:text-primary/80"
            >
              View all →
            </Link>
          }
        >
          {recentMcp && recentMcp.length > 0 ? (
            <ul className="space-y-2 font-mono text-xs">
              {recentMcp.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 px-3 py-2 border border-border/60 bg-background/30"
                >
                  <span
                    className={
                      e.decision === "block"
                        ? "w-2 h-2 rounded-full bg-red-400"
                        : e.decision.startsWith("allow")
                          ? "w-2 h-2 rounded-full bg-primary"
                          : "w-2 h-2 rounded-full bg-yellow-400"
                    }
                  />
                  <span className="text-foreground/40 w-16">
                    {new Date(e.created_at).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className="uppercase text-primary/80 w-20 tracking-wider">
                    {e.decision}
                  </span>
                  <span className="text-foreground/80 truncate flex-1">
                    {e.tool_name} — {e.action_summary ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Network}
              title="No tool events yet"
              description="Pair a runner and connect Claude Code through Vibefence to see live tool decisions."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/projects/new">Create a project</Link>
                </Button>
              }
            />
          )}
        </SectionCard>

        <SectionCard
          id="agents"
          title="Live Agent Activity"
          subtitle="Red-team agents at work"
          pillar={2}
        >
          {liveScans && liveScans.length > 0 ? (
            <div className="space-y-3">
              {liveScans.map((scan) => {
                const events = liveScanEvents[scan.id] ?? [];
                return (
                  <Link
                    key={scan.id}
                    href={`/projects/${scan.project_id}`}
                    className="block border border-border bg-background/30 hover:border-primary/40 transition-colors"
                  >
                    <div className="px-3 py-2 border-b border-border flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-glow shadow-primary" />
                      <span className="font-mono text-xs text-foreground/70">
                        scan {scan.id.slice(0, 8)} · {scan.target_url ?? "—"}
                      </span>
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-primary">
                        {scan.status}
                      </span>
                    </div>
                    <ul className="px-3 py-2 font-mono text-xs space-y-0.5">
                      {events.length === 0 && (
                        <li className="text-foreground/30">awaiting events…</li>
                      )}
                      {events.map((e) => {
                        const tone =
                          e.agent_name === "cartographer" ? "text-cyan-300"
                          : e.agent_name === "auth" ? "text-primary"
                          : e.agent_name === "evidence" ? "text-amber-300"
                          : "text-foreground/60";
                        return (
                          <li key={e.id} className="flex gap-2">
                            <span className="text-foreground/30 w-12 shrink-0">
                              {new Date(e.created_at).toLocaleTimeString([], { hour12: false })}
                            </span>
                            <span className={`uppercase tracking-wider w-24 shrink-0 ${tone}`}>
                              {e.agent_name}
                            </span>
                            <span className="text-foreground/70 truncate">{e.message}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Gauge}
              title="No scans running"
              description="Start a red-team scan against a localhost or verified preview to see Cartographer, Auth, and Evidence agents work in real time."
            />
          )}
        </SectionCard>

        <SectionCard
          id="approvals"
          title="Pending Approvals"
          subtitle="High-impact actions awaiting your decision"
          pillar={3}
        >
          {pendingApprovalRows && pendingApprovalRows.length > 0 ? (
            <ul className="space-y-2 font-mono text-xs">
              {pendingApprovalRows.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/projects/${a.project_id}#approvals`}
                    className="flex items-center gap-3 px-3 py-2 border border-amber-400/40 bg-amber-400/5 hover:border-amber-300 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse shrink-0" />
                    <span className="text-foreground/40 w-16 shrink-0">
                      {new Date(a.created_at).toLocaleTimeString([], { hour12: false })}
                    </span>
                    {a.risk_level && (
                      <span className="uppercase text-amber-300 tracking-wider w-16 shrink-0">
                        {a.risk_level}
                      </span>
                    )}
                    <span className="text-foreground/80 truncate flex-1">
                      {a.requested_action}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Bell}
              title="Inbox is clear"
              description="Risky agent actions (database migrations, force pushes, deploys) will queue here with snapshot + sandbox results."
            />
          )}
        </SectionCard>

        <SectionCard
          id="snapshots"
          title="Recent Snapshots"
          subtitle="Reversible state captured before risky actions"
          pillar={3}
        >
          {recentSnapshots && recentSnapshots.length > 0 ? (
            <ul className="space-y-2 font-mono text-xs">
              {recentSnapshots.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/projects/${s.project_id}#approvals`}
                    className="flex items-center gap-3 px-3 py-2 border border-border/60 bg-background/30 hover:border-primary/40 transition-colors"
                  >
                    <Camera className="w-3 h-3 text-primary/70 shrink-0" />
                    <span className="text-foreground/40 w-16 shrink-0">
                      {new Date(s.created_at).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span className="uppercase text-primary/70 tracking-wider w-20 shrink-0">
                      {s.type}
                    </span>
                    <span className="uppercase text-foreground/60 tracking-wider w-24 shrink-0">
                      {s.status}
                    </span>
                    <span className="text-foreground/70 truncate flex-1">
                      {s.metadata?.snap_schema ?? "—"}
                    </span>
                    {s.size_bytes != null && (
                      <span className="text-foreground/40 shrink-0">
                        {(s.size_bytes / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Camera}
              title="No snapshots yet"
              description="Vibefence creates database, filesystem, and Git snapshots automatically before high-impact agent actions."
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
