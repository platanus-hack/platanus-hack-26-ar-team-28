"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Camera,
  Lock,
  Network,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { McpEventFeed } from "@/components/mcp/mcp-event-feed";
import { ApprovalsFeed } from "@/components/approval/approvals-feed";
import { SnapshotsList } from "@/components/sentinel/snapshots-list";
import { cn } from "@/lib/utils";

interface ProjectOption {
  id: string;
  name: string;
  hasOnlineRunner: boolean;
}

interface Props {
  projects: ProjectOption[];
  initialProjectId: string | null;
}

export function SentinelLive({ projects, initialProjectId }: Props) {
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [counts, setCounts] = useState({ events: 0, blocks: 0, pending: 0, snapshots: 0 });

  // Auto-refresh project status (online runners may come/go).
  const [liveProjects, setLiveProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => {
    const supabase = createClient();
    let stop = false;
    async function refresh() {
      await supabase.rpc("sweep_stale_runners");
      const { data } = await supabase
        .from("projects")
        .select("id, name, project_runners(runner_id, runners(status))");
      if (stop || !data) return;
      const fresh: ProjectOption[] = data.map((p) => {
        const links = (p.project_runners as unknown as
          Array<{ runners: { status: string } | { status: string }[] | null }>
          | undefined) ?? [];
        const hasOnline = links.some((l) => {
          const r = l.runners;
          if (!r) return false;
          if (Array.isArray(r)) return r.some((x) => x.status === "online");
          return r.status === "online";
        });
        return { id: p.id, name: p.name, hasOnlineRunner: hasOnline };
      });
      setLiveProjects(fresh);
    }
    void refresh();
    const t = window.setInterval(refresh, 3000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  // Live counters for the HUD bar.
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    let stop = false;
    async function refresh() {
      const [{ count: events }, { count: blocks }, { count: pending }, { count: snaps }] =
        await Promise.all([
          supabase.from("mcp_events").select("id", { count: "exact", head: true }).eq("project_id", projectId),
          supabase
            .from("mcp_events")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .eq("decision", "block"),
          supabase
            .from("approvals")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .eq("status", "pending"),
          supabase.from("snapshots").select("id", { count: "exact", head: true }).eq("project_id", projectId),
        ]);
      if (stop) return;
      setCounts({
        events: events ?? 0,
        blocks: blocks ?? 0,
        pending: pending ?? 0,
        snapshots: snaps ?? 0,
      });
    }
    void refresh();
    const t = window.setInterval(refresh, 2500);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [projectId]);

  const selectedProject = liveProjects.find((p) => p.id === projectId);

  return (
    <div className="container py-10 max-w-[1400px] space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-3 max-w-3xl"
      >
        <div className="flex items-center gap-2">
          <span className="w-1 h-4 bg-primary" />
          <p className="font-mono uppercase text-[10px] text-primary tracking-[0.3em]">
            Pillar I + III · Live supervision
          </p>
        </div>
        <h1 className="font-sentient text-5xl text-foreground leading-[1.05]">
          Sentinel.<br />
          <span className="text-primary">Every tool call. Live.</span>
        </h1>
        <p className="font-mono text-sm text-foreground/55 leading-relaxed max-w-xl">
          The trust gateway sees every tool call your AI agent attempts.
          Blocks land in the feed. High-impact actions trigger snapshots and
          approvals. Sit on this page during your demo — beats 4 and 5 will
          materialize here in real time.
        </p>
      </motion.div>

      {/* Project picker + HUD */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        <div className="lg:w-72 border border-border bg-background/40 backdrop-blur-sm">
          <p className="px-4 py-2 border-b border-border font-mono uppercase text-[10px] tracking-widest text-foreground/50">
            Watching project
          </p>
          {liveProjects.length === 0 ? (
            <p className="px-4 py-4 font-mono text-xs text-foreground/40">
              No projects yet. Create one in the Projects tab to begin.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {liveProjects.map((p) => {
                const active = p.id === projectId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setProjectId(p.id)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors",
                        active ? "bg-primary/10 text-primary" : "hover:bg-foreground/5 text-foreground/85",
                      )}
                    >
                      <span className="font-mono text-xs truncate">{p.name}</span>
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          p.hasOnlineRunner
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]"
                            : "bg-foreground/30",
                        )}
                        title={p.hasOnlineRunner ? "Runner online" : "No live runner"}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HudCard label="Events" value={counts.events} icon={Network} />
          <HudCard label="Blocks" value={counts.blocks} icon={ShieldCheck} highlight={counts.blocks > 0} />
          <HudCard label="Pending approvals" value={counts.pending} icon={Lock} highlight={counts.pending > 0} />
          <HudCard label="Snapshots" value={counts.snapshots} icon={Camera} />
        </div>
      </div>

      {/* If no online runner: clear demo-mode hint */}
      {selectedProject && !selectedProject.hasOnlineRunner && (
        <div className="border border-amber-400/40 bg-amber-400/5 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="font-mono text-xs text-amber-200/90 leading-relaxed">
            <p>
              No live runner for <span className="text-amber-300">{selectedProject.name}</span>.
              Live policy events and approvals require a paired agent.
            </p>
            <p className="mt-1.5 text-amber-200/70">
              Pair an agent with <code className="bg-background/60 px-1">vibefence pair &lt;code&gt;</code> and start it with{" "}
              <code className="bg-background/60 px-1">vibefence start</code>.
            </p>
          </div>
        </div>
      )}

      {!projectId && (
        <p className="font-mono text-xs text-foreground/40">Pick a project to watch.</p>
      )}

      {projectId && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
          {/* Left: MCP feed + Trust Graph (the existing component renders both inside) */}
          <section className="space-y-3">
            <SectionHeader
              icon={Radio}
              title="Pillar I · Tool Audit Layer"
              subtitle="Every Bash / Edit / Write / tool call routed through the trust gateway"
              tone="primary"
            />
            <McpEventFeed projectId={projectId} />
          </section>

          {/* Right: Approvals + Snapshots */}
          <section className="space-y-6">
            <div className="space-y-3">
              <SectionHeader
                icon={Lock}
                title="Pillar III · Approvals"
                subtitle="High-impact actions paused for human review"
                tone="amber"
              />
              <ApprovalsFeed projectId={projectId} />
            </div>
            <div className="space-y-3">
              <SectionHeader
                icon={Camera}
                title="Reversible state"
                subtitle="Snapshots captured before destructive operations"
                tone="primary"
              />
              <SnapshotsList projectId={projectId} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  tone: "primary" | "amber";
}) {
  const text = tone === "amber" ? "text-amber-300" : "text-primary";
  return (
    <header className="flex items-start gap-3">
      <div className={cn("w-8 h-8 flex items-center justify-center bg-foreground/5 border border-foreground/10")}>
        <Icon className={cn("w-4 h-4", text)} />
      </div>
      <div>
        <p className={cn("font-mono uppercase text-[10px] tracking-[0.25em]", text)}>
          {title}
        </p>
        <p className="font-mono text-[11px] text-foreground/50 mt-0.5">{subtitle}</p>
      </div>
    </header>
  );
}

function HudCard({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "border bg-background/40 backdrop-blur-sm p-4 relative overflow-hidden",
        highlight ? "border-primary/50 shadow-glow shadow-primary/30" : "border-border",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono uppercase text-[9px] tracking-[0.25em] text-foreground/40">
          {label}
        </p>
        <Icon className={cn("w-3.5 h-3.5", highlight ? "text-primary" : "text-foreground/40")} />
      </div>
      <motion.p
        key={String(value)}
        initial={{ scale: 1.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "font-sentient text-3xl leading-none",
          highlight ? "text-primary" : "text-foreground/85",
        )}
      >
        {value}
      </motion.p>
    </div>
  );
}
