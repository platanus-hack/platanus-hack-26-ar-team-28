"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Crosshair, FolderOpen, Globe, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { AgentFeed } from "@/components/scan/agent-feed";
import type { Finding, Scan } from "@/types/api";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  hasRunner: boolean;
  initialTargetUrl?: string | null;
}

const STORAGE_KEY_PREFIX = "vibefence:scan-target:";
const DEFAULT_TARGET_URL = "http://localhost:4000";

interface ScanTarget {
  target_url: string;
  target_repo: string;
  advanced_mode?: boolean;
}

function loadStoredTarget(projectId: string): ScanTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScanTarget;
    if (typeof parsed.target_url === "string" && typeof parsed.target_repo === "string") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveStoredTarget(projectId: string, target: ScanTarget) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + projectId, JSON.stringify(target));
  } catch {
    /* ignore */
  }
}

export function ScanLauncher({ projectId, hasRunner: initialHasRunner, initialTargetUrl }: Props) {
  const [pending, startTransition] = useTransition();
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [hasRunner, setHasRunner] = useState<boolean>(initialHasRunner);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetUrl, setTargetUrl] = useState<string>(initialTargetUrl ?? DEFAULT_TARGET_URL);
  const [targetRepo, setTargetRepo] = useState<string>("");
  // Off by default: the demo flow runs the IDOR-only pipeline. Toggle on
  // for the broader sweep (unauth, SQLi, HTTP method tampering).
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  // Tracks "has anyone ever paired" vs "paired but offline" vs "online".
  // Lets us show the right help text instead of telling the user to pair
  // when they already have.
  const [runnerKnown, setRunnerKnown] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function refreshHasRunner() {
      // Sweep stale runners so we never offer to scan against a dead runner.
      await supabase.rpc("sweep_stale_runners");
      const { data } = await supabase
        .from("project_runners")
        .select("runner_id, runners(status)")
        .eq("project_id", projectId)
        .limit(1)
        .maybeSingle();
      const status = (data?.runners as { status?: string } | undefined)?.status;
      setHasRunner(status === "online");
      setRunnerKnown(Boolean(data?.runner_id));
    }

    void refreshHasRunner();

    void supabase
      .from("scans")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<Scan[]>()
      .then(({ data }) => data && setRecentScans(data));

    void supabase
      .from("findings")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .returns<Finding[]>()
      .then(({ data }) => data && setFindings(data));

    const ch = supabase
      .channel(`project_scans:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `project_id=eq.${projectId}` },
        async () => {
          const { data } = await supabase
            .from("scans")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(5)
            .returns<Scan[]>();
          if (data) setRecentScans(data);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "findings", filter: `project_id=eq.${projectId}` },
        (p) => setFindings((prev) => [p.new as Finding, ...prev]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_runners", filter: `project_id=eq.${projectId}` },
        () => void refreshHasRunner(),
      )
      .subscribe();

    // Polling fallback: also recheck runner availability every 2s.
    const poll = window.setInterval(() => void refreshHasRunner(), 2000);

    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(poll);
    };
  }, [projectId]);

  // Load the last-used scan target from localStorage on mount.
  useEffect(() => {
    const stored = loadStoredTarget(projectId);
    if (stored) {
      setTargetUrl(stored.target_url);
      setTargetRepo(stored.target_repo);
      if (typeof stored.advanced_mode === "boolean") {
        setAdvancedMode(stored.advanced_mode);
      }
    }
  }, [projectId]);

  function openPicker() {
    if (!targetUrl) setTargetUrl(initialTargetUrl ?? DEFAULT_TARGET_URL);
    setPickerOpen(true);
  }

  function submitScan() {
    const tu = targetUrl.trim();
    const tr = targetRepo.trim();
    if (!tu) {
      toast.error("Target URL is required.");
      return;
    }
    if (!tr) {
      toast.error("Target repo path is required.");
      return;
    }
    saveStoredTarget(projectId, {
      target_url: tu,
      target_repo: tr,
      advanced_mode: advancedMode,
    });
    setPickerOpen(false);
    startTransition(async () => {
      const r = await fetch(`/api/projects/${projectId}/scans/trigger`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_url: tu,
          target_repo: tr,
          intensity: advancedMode ? "aggressive" : "safe",
        }),
      });
      if (!r.ok) {
        const err = (await r.json()) as { detail?: string; error?: string };
        toast.error(err.detail ?? err.error ?? "Failed to start scan");
        return;
      }
      const data = (await r.json()) as { scan_id: string };
      setActiveScanId(data.scan_id);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-1">
            Pillar II — Agentic red-team
          </p>
          <p className="font-sentient text-xl text-foreground">Run a red-team scan</p>
          <p className="font-mono text-xs text-foreground/50 mt-1">
            Cartographer, Auth, and Evidence agents probe localhost for verified vulnerabilities.
          </p>
        </div>
        <Button onClick={openPicker} disabled={pending || !hasRunner}>
          <Crosshair className="w-4 h-4 mr-2" />
          {pending ? "Starting…" : "Run Scan"}
        </Button>
      </div>

      {!hasRunner && (
        <div className="border border-amber-400/40 bg-amber-400/5 px-3 py-2 font-mono text-xs text-amber-200/90 space-y-1">
          {runnerKnown ? (
            <>
              <p>Runner offline. Start it on your machine to enable scans:</p>
              <code className="block bg-background/60 px-2 py-1 text-amber-300">
                vibefence start
              </code>
            </>
          ) : (
            <p>Pair a runner first — the scanner runs locally on your machine.</p>
          )}
        </div>
      )}

      {recentScans.length > 0 && (
        <div className="border border-border bg-background/40 backdrop-blur-sm">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <p className="font-mono uppercase text-[10px] text-foreground/50 tracking-widest">
              Recent scans
            </p>
          </div>
          <ul className="divide-y divide-border">
            {recentScans.map((s) => {
              const findingsCount = findings.filter((f) => f.scan_id === s.id).length;
              return (
                <li
                  key={s.id}
                  className="px-4 py-3 flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        s.status === "completed" ? "bg-emerald-400"
                          : s.status === "running" || s.status === "queued" ? "bg-primary animate-pulse"
                          : "bg-foreground/30",
                      )}
                    />
                    <span className="text-foreground/40 w-16">{s.id.slice(0, 8)}</span>
                    <span className="uppercase text-foreground/70 w-20">{s.status}</span>
                    <span className="text-foreground/40">
                      {new Date(s.created_at).toLocaleTimeString([], { hour12: false })}
                    </span>
                    {s.target_url && (
                      <span className="text-foreground/60">→ {s.target_url}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground/50">
                      {findingsCount} finding{findingsCount === 1 ? "" : "s"}
                    </span>
                    {(s.status === "running" || s.status === "queued") && (
                      <button
                        onClick={() => setActiveScanId(s.id)}
                        className="text-primary hover:text-primary/80 uppercase tracking-wider"
                      >
                        Open feed →
                      </button>
                    )}
                    {s.status === "completed" && (
                      <button
                        onClick={() => setActiveScanId(s.id)}
                        className="text-foreground/60 hover:text-foreground uppercase tracking-wider"
                      >
                        Replay →
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activeScanId && (
        <AgentFeed scanId={activeScanId} onClose={() => setActiveScanId(null)} />
      )}

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {pickerOpen && (
            <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm"
              onClick={() => setPickerOpen(false)}
            />
            <motion.div
              key="modal"
              role="dialog"
              aria-label="Configure scan target"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              onClick={(e) => {
                // Click on backdrop closes; click on the inner card doesn't.
                if (e.target === e.currentTarget) setPickerOpen(false);
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg border border-primary/40 bg-background shadow-2xl"
              >
                <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-primary/30">
                  <div>
                    <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-1">
                      Pillar II · Scan target
                    </p>
                    <h3 className="font-sentient text-xl text-foreground">
                      Where should we scan?
                    </h3>
                    <p className="font-mono text-[10px] text-foreground/50 mt-1">
                      The runner is machine-wide. The scan needs the URL of a running app + the path to its source on this runner.
                    </p>
                  </div>
                  <button
                    onClick={() => setPickerOpen(false)}
                    className="text-foreground/60 hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </header>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitScan();
                  }}
                  className="p-5 space-y-4"
                >
                  <label className="block space-y-1.5">
                    <span className="font-mono uppercase text-[10px] text-foreground/60 tracking-widest flex items-center gap-1.5">
                      <Globe className="w-3 h-3" /> Target URL
                    </span>
                    <input
                      autoFocus
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
                      Absolute path on the runner. Cartographer ripgreps `app/` here for routes.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer pt-1 select-none">
                    <input
                      type="checkbox"
                      checked={advancedMode}
                      onChange={(e) => setAdvancedMode(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-primary cursor-pointer"
                    />
                    <span className="space-y-0.5">
                      <span className="block font-mono uppercase text-[10px] text-foreground/70 tracking-widest">
                        Advanced red-team
                      </span>
                      <span className="block font-mono text-[10px] text-foreground/40">
                        Adds unauthenticated-endpoint, SQL-injection, and HTTP method-tampering probes after the IDOR pipeline. Slower (~60s vs ~30s).
                      </span>
                    </span>
                  </label>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={pending}>
                      <Crosshair className="w-3.5 h-3.5 mr-1.5" />
                      {pending ? "Starting…" : "Launch scan"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
