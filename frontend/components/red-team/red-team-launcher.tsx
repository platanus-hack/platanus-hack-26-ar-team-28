"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Crosshair,
  FolderOpen,
  Globe,
  Server,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgentFeed } from "@/components/scan/agent-feed";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Runner } from "@/types/api";

interface RunnerRow extends Runner {
  project_id: string | null;
  project_name: string | null;
}

interface Props {
  runners: RunnerRow[];
}

const STORAGE_KEY = "vibefence:red-team-target";
const DEFAULT_TARGET_URL = "http://localhost:4000";
const DEFAULT_TARGET_REPO = "C:\\Users\\jo\\Documents\\vibefence\\demo-app";

interface StoredTarget {
  runner_id: string | null;
  target_url: string;
  target_repo: string;
}

function loadStored(): StoredTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTarget;
  } catch {
    return null;
  }
}

function saveStored(t: StoredTarget) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export function RedTeamLauncher({ runners: initialRunners }: Props) {
  const [runners, setRunners] = useState<RunnerRow[]>(initialRunners);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState(DEFAULT_TARGET_URL);
  const [targetRepo, setTargetRepo] = useState(DEFAULT_TARGET_REPO);
  const [pending, startTransition] = useTransition();
  const [activeScanId, setActiveScanId] = useState<string | null>(null);

  // Default selection: first online runner.
  useEffect(() => {
    if (selectedRunnerId) return;
    const online = runners.find((r) => r.status === "online");
    if (online) setSelectedRunnerId(online.id);
  }, [runners, selectedRunnerId]);

  // Restore last-used target.
  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      if (stored.runner_id && runners.some((r) => r.id === stored.runner_id)) {
        setSelectedRunnerId(stored.runner_id);
      }
      if (stored.target_url) setTargetUrl(stored.target_url);
      if (stored.target_repo) setTargetRepo(stored.target_repo);
    }
    // Run only on first mount; runners list change doesn't replay this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live runner status — sweep + repoll every 2s.
  useEffect(() => {
    const supabase = createClient();
    let stop = false;
    async function refresh() {
      await supabase.rpc("sweep_stale_runners");
      const { data } = await supabase
        .from("runners")
        .select("*, project_runners(project_id, projects(id, name))")
        .order("status", { ascending: true })
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (stop || !data) return;
      const flat = data.map((r) => {
        const link = (r.project_runners as Array<{ projects: { id: string; name: string } }> | undefined)?.[0];
        const proj = link?.projects;
        const { project_runners: _omit, ...rest } = r as { project_runners: unknown } & Runner;
        return {
          ...(rest as Runner),
          project_id: proj?.id ?? null,
          project_name: proj?.name ?? null,
        };
      });
      setRunners(flat);
    }
    void refresh();
    const t = window.setInterval(refresh, 2000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  const selectedRunner = runners.find((r) => r.id === selectedRunnerId) ?? null;
  const canLaunch =
    !!selectedRunner &&
    selectedRunner.status === "online" &&
    !!selectedRunner.project_id &&
    !!targetUrl.trim() &&
    !!targetRepo.trim() &&
    !pending;

  function launch() {
    if (!selectedRunner?.project_id) return;
    const tu = targetUrl.trim();
    const tr = targetRepo.trim();
    saveStored({ runner_id: selectedRunner.id, target_url: tu, target_repo: tr });
    startTransition(async () => {
      const r = await fetch(
        `/api/projects/${selectedRunner.project_id}/scans/trigger`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_url: tu, target_repo: tr }),
        },
      );
      if (!r.ok) {
        const err = (await r.json()) as { detail?: string; error?: string };
        toast.error(err.detail ?? err.error ?? "Failed to launch scan");
        return;
      }
      const data = (await r.json()) as { scan_id: string };
      setActiveScanId(data.scan_id);
    });
  }

  return (
    <div className="container py-10 max-w-[1200px] space-y-10">
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
            Pillar II · Agentic red-team
          </p>
        </div>
        <h1 className="font-sentient text-5xl text-foreground leading-[1.05]">
          Pick a runner.<br />
          <span className="text-primary">Launch a scan.</span>
        </h1>
        <p className="font-mono text-sm text-foreground/55 leading-relaxed max-w-xl">
          The runner crawls a localhost target you control, runs cross-tenant
          probes, and verifies every finding by replay. Sensitive evidence
          stays on your machine.
        </p>
      </motion.div>

      {/* Runner picker */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono uppercase text-[11px] tracking-[0.25em] text-foreground/50">
            Select a runner
          </h2>
          <Link
            href="/runners"
            className="font-mono uppercase text-[10px] tracking-widest text-foreground/40 hover:text-primary"
          >
            Manage runners →
          </Link>
        </div>

        {runners.length === 0 ? (
          <div className="border border-dashed border-border/60 px-6 py-10 text-center">
            <Server className="w-8 h-8 text-foreground/30 mx-auto mb-3" />
            <p className="font-sentient text-lg text-foreground/80">No runners yet</p>
            <p className="font-mono text-xs text-foreground/40 mt-2 max-w-sm mx-auto">
              Pair a machine first — open a project, generate a code, then
              run <code className="bg-background/60 px-1">vibefence pair</code> on the host you want to scan from.
            </p>
            <Button asChild className="mt-5">
              <Link href="/projects">Go to projects</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {runners.map((r) => (
              <RunnerCard
                key={r.id}
                runner={r}
                selected={r.id === selectedRunnerId}
                onSelect={() => setSelectedRunnerId(r.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Target form + launch */}
      {runners.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-mono uppercase text-[11px] tracking-[0.25em] text-foreground/50">
            Configure scan target
          </h2>
          <div className="border border-primary/30 bg-background/40 backdrop-blur-sm">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="block space-y-1.5">
                <span className="font-mono uppercase text-[10px] text-foreground/60 tracking-widest flex items-center gap-1.5">
                  <Globe className="w-3 h-3" /> Target URL
                </span>
                <input
                  type="url"
                  required
                  placeholder="http://localhost:4000"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="w-full bg-background border border-border px-3 h-10 font-mono text-sm focus:outline-none focus:border-primary/60 transition-colors"
                />
                <span className="font-mono text-[10px] text-foreground/40">
                  Where the application under test is running. Restricted to localhost by the Scope Agent.
                </span>
              </label>

              <label className="block space-y-1.5">
                <span className="font-mono uppercase text-[10px] text-foreground/60 tracking-widest flex items-center gap-1.5">
                  <FolderOpen className="w-3 h-3" /> Target repo
                </span>
                <input
                  type="text"
                  required
                  placeholder="/path/to/your/project"
                  value={targetRepo}
                  onChange={(e) => setTargetRepo(e.target.value)}
                  className="w-full bg-background border border-border px-3 h-10 font-mono text-sm focus:outline-none focus:border-primary/60 transition-colors"
                />
                <span className="font-mono text-[10px] text-foreground/40">
                  Absolute path on the runner. Cartographer ripgreps it for routes.
                </span>
              </label>
            </div>

            <div className="border-t border-primary/20 bg-background/40 px-5 py-4 flex items-center justify-between gap-4">
              <div className="font-mono text-[11px] text-foreground/55">
                {selectedRunner ? (
                  <>
                    Will run on{" "}
                    <span className="text-foreground/85">
                      {selectedRunner.machine_name}
                    </span>{" "}
                    {selectedRunner.status === "online" ? (
                      <span className="text-emerald-300">(online)</span>
                    ) : (
                      <span className="text-amber-300">(offline)</span>
                    )}
                    {selectedRunner.project_name && (
                      <>
                        {" · scoped to "}
                        <span className="text-foreground/85">{selectedRunner.project_name}</span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-foreground/40">Pick a runner above to enable launch.</span>
                )}
              </div>
              <Button onClick={launch} disabled={!canLaunch}>
                <Crosshair className="w-4 h-4 mr-2" />
                {pending ? "Starting…" : "Launch scan"}
              </Button>
            </div>
          </div>
          {selectedRunner && selectedRunner.status !== "online" && (
            <p className="font-mono text-xs text-amber-400">
              Selected runner is offline. Start it on its machine: <code className="bg-background/60 px-1">vibefence start</code>
            </p>
          )}
          {selectedRunner && !selectedRunner.project_id && (
            <p className="font-mono text-xs text-amber-400">
              Selected runner isn&apos;t linked to a project yet — pair it via a
              project first so we know where to record findings.
            </p>
          )}
        </section>
      )}

      {/* What each agent does — visual primer */}
      <section className="space-y-3">
        <h2 className="font-mono uppercase text-[11px] tracking-[0.25em] text-foreground/50">
          What happens when you launch
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PrimerCard
            tone="cyan"
            icon={Crosshair}
            label="01 · Cartographer"
            body="Crawls the target, parses Next.js route files, builds a route graph."
          />
          <PrimerCard
            tone="orange"
            icon={Activity}
            label="02 · Auth Agent"
            body="Cross-tenant probes against every [id] route; flags 200s where 403/404 was expected."
          />
          <PrimerCard
            tone="gold"
            icon={ShieldCheck}
            label="03 · Evidence Agent"
            body="Replays each suspected finding from a fresh session. No verification, no finding."
          />
        </div>
      </section>

      {activeScanId && (
        <AgentFeed scanId={activeScanId} onClose={() => setActiveScanId(null)} />
      )}
    </div>
  );
}

function RunnerCard({
  runner,
  selected,
  onSelect,
}: {
  runner: RunnerRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const online = runner.status === "online";
  const canSelect = online && !!runner.project_id;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!canSelect}
      className={cn(
        "text-left border bg-background/40 backdrop-blur-sm p-4 transition-colors w-full",
        selected
          ? "border-primary/70 bg-primary/5"
          : "border-border hover:border-primary/40",
        !canSelect && "opacity-60 cursor-not-allowed hover:border-border",
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            online
              ? "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]"
              : "bg-foreground/30",
          )}
        />
        <span
          className={cn(
            "font-mono uppercase text-[10px] tracking-widest",
            online ? "text-emerald-300" : "text-foreground/40",
          )}
        >
          {runner.status}
        </span>
        {selected && (
          <span className="ml-auto font-mono uppercase text-[10px] tracking-widest text-primary">
            selected
          </span>
        )}
      </div>
      <p className="font-sentient text-base text-foreground line-clamp-1">
        {runner.machine_name}
      </p>
      <p className="font-mono text-[10px] text-foreground/45 mt-1">
        {runner.os ?? "?"} · v{runner.version ?? "?"}
      </p>
      <div className="mt-3 pt-3 border-t border-border">
        <p className="font-mono text-[10px] text-foreground/40 uppercase tracking-widest">
          Linked project
        </p>
        <p className="font-mono text-xs text-foreground/75 mt-0.5 truncate">
          {runner.project_name ?? "—"}
        </p>
      </div>
    </button>
  );
}

function PrimerCard({
  tone,
  icon: Icon,
  label,
  body,
}: {
  tone: "cyan" | "orange" | "gold";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
}) {
  const TONE: Record<typeof tone, { border: string; iconBg: string; text: string }> = {
    cyan: { border: "border-cyan-500/40", iconBg: "bg-cyan-500/15", text: "text-cyan-300" },
    orange: { border: "border-primary/40", iconBg: "bg-primary/15", text: "text-primary" },
    gold: { border: "border-amber-400/40", iconBg: "bg-amber-400/15", text: "text-amber-300" },
  };
  const t = TONE[tone];
  return (
    <div className={cn("border bg-background/30 backdrop-blur-sm p-4", t.border)}>
      <div className="flex items-center gap-3 mb-2">
        <div className={cn("w-8 h-8 flex items-center justify-center", t.iconBg)}>
          <Icon className={cn("w-4 h-4", t.text)} />
        </div>
        <p className={cn("font-mono uppercase text-[10px] tracking-[0.2em]", t.text)}>
          {label}
        </p>
      </div>
      <p className="font-mono text-xs text-foreground/65 leading-relaxed">{body}</p>
    </div>
  );
}
