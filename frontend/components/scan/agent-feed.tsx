"use client";
/**
 * Red-Team Workspace — full-screen scan UI.
 *
 * Layout:
 *   ┌─ topbar (status + counts + close) ─────────────────────┐
 *   │                                                        │
 *   │  [Cartographer] ─→ [Auth Agent] ─→ [Evidence Agent]    │
 *   │     11 routes        2 probes        2 verified        │
 *   │     ●●● live          ●●● live        ●●● live         │
 *   │                                                        │
 *   │  Activity stream (timestamped)                         │
 *   │                                                        │
 *   ├─ Verified findings (slides in when ≥1) ────────────────┤
 *   │   [HIGH] Broken Access Control                         │
 *   │   PoC code block                                       │
 *   │   [Fix vulns]                                          │
 *   └────────────────────────────────────────────────────────┘
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Activity, Crosshair, Maximize2, Minimize2, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Finding, ScanEvent } from "@/types/api";
import { AgentNode, type AgentNodeData } from "@/components/scan/agent-node";
import { AgentConnector } from "@/components/scan/agent-connector";
import { EventTicker } from "@/components/scan/event-ticker";
import { FindingPanel } from "@/components/scan/finding-panel";
import { FixModal } from "@/components/scan/fix-modal";

interface Props {
  scanId: string;
  onClose: () => void;
}

interface EvidenceRow {
  id: string;
  finding_id: string;
  redacted_request: string | null;
  redacted_response: string | null;
}

const AGENT_DEFS: Array<{
  agent: string;
  label: string;
  description: string;
  tone: AgentNodeData["tone"];
  metricLabel: string;
}> = [
  {
    agent: "cartographer",
    label: "Pillar II · 01",
    description:
      "Crawls the target, parses Next.js route files, builds the surface map.",
    tone: "cyan",
    metricLabel: "routes",
  },
  {
    agent: "auth",
    label: "Pillar II · 02",
    description:
      "Cross-tenant probes against every [id] route; flags 200s where 403/404 was expected.",
    tone: "orange",
    metricLabel: "probes",
  },
  {
    agent: "evidence",
    label: "Pillar II · 03",
    description:
      "Replays each suspected finding from a fresh session; rejects anything it can't reproduce.",
    tone: "gold",
    metricLabel: "verified",
  },
];

export function AgentFeed({ scanId, onClose }: Props) {
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [evidenceByFinding, setEvidenceByFinding] = useState<Record<string, EvidenceRow>>({});
  const [scanComplete, setScanComplete] = useState(false);
  const [fixTarget, setFixTarget] = useState<Finding | null>(null);
  const seenEventIds = useRef(new Set<string>());

  useEffect(() => {
    const supabase = createClient();

    async function refresh() {
      const [eventsRes, findingsRes, scanRes] = await Promise.all([
        supabase
          .from("scan_events")
          .select("*")
          .eq("scan_id", scanId)
          .order("created_at", { ascending: true })
          .returns<ScanEvent[]>(),
        supabase
          .from("findings")
          .select("*")
          .eq("scan_id", scanId)
          .returns<Finding[]>(),
        supabase
          .from("scans")
          .select("status")
          .eq("id", scanId)
          .single(),
      ]);

      if (eventsRes.data) {
        const fresh: ScanEvent[] = [];
        for (const e of eventsRes.data) {
          if (!seenEventIds.current.has(e.id)) {
            seenEventIds.current.add(e.id);
            fresh.push(e);
          }
        }
        if (fresh.length > 0) {
          setEvents((prev) => {
            const combined = [...prev, ...fresh];
            combined.sort((a, b) => a.created_at.localeCompare(b.created_at));
            return combined;
          });
        }
      }

      if (findingsRes.data) {
        const data = findingsRes.data;
        setFindings((prev) => {
          const seenIds = new Set(prev.map((f) => f.id));
          const merged = [...prev];
          for (const f of data) {
            if (!seenIds.has(f.id)) merged.push(f);
          }
          return merged;
        });
        // Pull evidence for any findings we don't have it for yet.
        const haveEvidenceFor = new Set(Object.keys(evidenceByFinding));
        const missing = data
          .map((f) => f.id)
          .filter((fid) => !haveEvidenceFor.has(fid));
        if (missing.length > 0) {
          const { data: evRows } = await supabase
            .from("evidence")
            .select("id, finding_id, redacted_request, redacted_response")
            .in("finding_id", missing)
            .returns<EvidenceRow[]>();
          if (evRows) {
            setEvidenceByFinding((prev) => {
              const next = { ...prev };
              for (const r of evRows) next[r.finding_id] = r;
              return next;
            });
          }
        }
      }

      if (scanRes.data?.status === "completed" || scanRes.data?.status === "failed") {
        setScanComplete(true);
      }
    }

    void refresh();

    const eventsCh = supabase
      .channel(`scan_events:${scanId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scan_events", filter: `scan_id=eq.${scanId}` },
        (payload) => {
          const row = payload.new as ScanEvent;
          if (seenEventIds.current.has(row.id)) return;
          seenEventIds.current.add(row.id);
          setEvents((prev) => [...prev, row]);
        },
      )
      .subscribe();

    const findingsCh = supabase
      .channel(`findings:${scanId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "findings", filter: `scan_id=eq.${scanId}` },
        (payload) => {
          setFindings((prev) => {
            const next = payload.new as Finding;
            if (prev.some((f) => f.id === next.id)) return prev;
            return [...prev, next];
          });
        },
      )
      .subscribe();

    const scanCh = supabase
      .channel(`scans:${scanId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scans", filter: `id=eq.${scanId}` },
        (payload) => {
          const row = payload.new as { status: string };
          if (row.status === "completed" || row.status === "failed") setScanComplete(true);
        },
      )
      .subscribe();

    const poll = window.setInterval(refresh, 2000);

    return () => {
      supabase.removeChannel(eventsCh);
      supabase.removeChannel(findingsCh);
      supabase.removeChannel(scanCh);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  // Derive per-agent state from the event stream.
  const agentState = useMemo(() => {
    const state: Record<string, AgentNodeData> = {};
    for (const def of AGENT_DEFS) {
      const agentEvents = events.filter((e) => e.agent_name === def.agent);
      const last = agentEvents[agentEvents.length - 1];
      const hasOutput = agentEvents.length > 0;
      const status: AgentNodeData["status"] = !hasOutput
        ? "idle"
        : isAgentDone(def.agent, events, scanComplete)
          ? "done"
          : "active";
      const metricValue = computeMetric(def.agent, agentEvents, findings);
      state[def.agent] = {
        agent: def.agent,
        label: def.label,
        description: def.description,
        tone: def.tone,
        icon: iconFor(def.agent),
        lastMessage: last?.message ?? undefined,
        eventCount: agentEvents.length,
        status,
        metric: { label: def.metricLabel, value: metricValue },
      };
    }
    return state;
  }, [events, findings, scanComplete]);

  return <Workspace
    scanId={scanId}
    onClose={onClose}
    events={events}
    findings={findings}
    evidenceByFinding={evidenceByFinding}
    fixTarget={fixTarget}
    setFixTarget={setFixTarget}
    scanComplete={scanComplete}
    agentState={agentState}
  />;
}

interface WorkspaceProps {
  scanId: string;
  onClose: () => void;
  events: ScanEvent[];
  findings: Finding[];
  evidenceByFinding: Record<string, EvidenceRow>;
  fixTarget: Finding | null;
  setFixTarget: (f: Finding | null) => void;
  scanComplete: boolean;
  agentState: Record<string, AgentNodeData>;
}

function Workspace({
  scanId,
  onClose,
  events,
  findings,
  evidenceByFinding,
  fixTarget,
  setFixTarget,
  scanComplete,
  agentState,
}: WorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ESC closes the workspace.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Track real fullscreen state so the icon updates.
  useEffect(() => {
    function onFs() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      key="workspace"
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background"
    >
      {/* Layered backdrop — radial glow + grid + subtle scanlines */}
      <div className="absolute inset-0 pointer-events-none bg-grid" />
      <div className="absolute inset-0 pointer-events-none bg-radial-glow" />
      <div className="absolute inset-0 pointer-events-none bg-scanlines opacity-40" />
      {/* Edge gradient — adds the 'fullscreen TV' feel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(243,185,143,0.07), transparent 60%), " +
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(243,185,143,0.045), transparent 60%)",
        }}
      />

      {/* Animated boot scanline (one-shot) */}
      <motion.div
        initial={{ y: "-100%", opacity: 0.6 }}
        animate={{ y: "120%", opacity: 0 }}
        transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 h-px bg-primary shadow-[0_0_24px_4px_rgba(243,185,143,0.55)] pointer-events-none"
      />

      {/* Top bar — HUD style */}
      <header className="relative z-10 border-b border-primary/20 h-16 px-8 flex items-center justify-between flex-shrink-0 bg-background/40 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={
              scanComplete
                ? "w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.7)]"
                : "w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-glow shadow-primary"
            }
          />
          <div className="leading-tight">
            <p className="font-mono uppercase text-[10px] tracking-[0.25em] text-primary/70">
              Vibefence
            </p>
            <p className="font-sentient text-base text-foreground -mt-0.5">
              Red-team workspace
            </p>
          </div>
        </div>

        {/* Center — live HUD metrics */}
        <div className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
          <HudMetric label="Events" value={events.length} />
          <span className="text-foreground/20">·</span>
          <HudMetric label="Findings" value={findings.length} highlight />
          <span className="text-foreground/20">·</span>
          <HudMetric
            label={scanComplete ? "Status" : "Live"}
            value={scanComplete ? "complete" : "scanning"}
            highlight={!scanComplete}
          />
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-foreground/40 hidden sm:inline">
            scan <span className="text-foreground/80">{scanId.slice(0, 8)}</span>
          </span>
          <button
            onClick={toggleFullscreen}
            className="border border-primary/30 hover:border-primary/70 hover:text-primary p-2 transition-colors text-foreground/70"
            aria-label={isFullscreen ? "Exit browser fullscreen" : "Enter browser fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen (or press F11)"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="border border-primary/30 hover:border-red-400/70 hover:text-red-300 px-3 py-2 transition-colors text-foreground/80 inline-flex items-center gap-1.5"
            aria-label="Close workspace"
            title="Close (or press Esc)"
          >
            <X className="w-3.5 h-3.5" />
            <span className="font-mono uppercase text-[10px] tracking-widest hidden sm:inline">
              Esc
            </span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-[1500px] mx-auto px-8 py-10 space-y-10">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3 max-w-3xl"
          >
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 bg-primary" />
              <p className="font-mono uppercase text-[10px] text-primary tracking-[0.3em]">
                Pillar II · Agentic red-team
              </p>
            </div>
            <h1 className="font-sentient text-5xl md:text-6xl text-foreground leading-[1.05]">
              Three agents.<br />
              <span className="text-primary">Verified findings only.</span>
            </h1>
            <p className="font-mono text-sm text-foreground/55 leading-relaxed max-w-xl">
              Each agent has one job. They pass work down the chain. The
              Evidence Agent verifies every finding by replay before it
              promotes. No guesses. No hallucinations.
            </p>
          </motion.div>

          {/* Agent flow */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            <div className="flex-1 min-w-0">
              <AgentNode data={agentState.cartographer} bootDelay={0.15} />
            </div>
            <AgentConnector
              active={agentState.cartographer.status === "active" || agentState.cartographer.status === "done"}
              upstreamHasOutput={agentState.cartographer.eventCount > 0}
              label="route map"
              bootDelay={0.55}
            />
            <div className="flex-1 min-w-0">
              <AgentNode data={agentState.auth} bootDelay={0.3} />
            </div>
            <AgentConnector
              active={agentState.auth.status === "active" || agentState.auth.status === "done"}
              upstreamHasOutput={agentState.auth.eventCount > 0}
              label="hypotheses"
              tone="amber"
              bootDelay={0.65}
            />
            <div className="flex-1 min-w-0">
              <AgentNode data={agentState.evidence} bootDelay={0.45} />
            </div>
          </div>

          {/* Activity ticker */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.7 }}
          >
            <EventTicker events={events} />
          </motion.div>
        </div>
      </div>

      {/* Findings panel — slides up when ≥1 finding */}
      {findings.length > 0 && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10"
        >
          <FindingPanel
            findings={findings}
            evidenceByFindingId={evidenceByFinding}
            onFix={(f) => setFixTarget(f)}
          />
        </motion.div>
      )}

      <FixModal finding={fixTarget} onClose={() => setFixTarget(null)} />
    </motion.div>,
    document.body,
  );
}

function HudMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="font-mono uppercase text-[9px] tracking-[0.25em] text-foreground/40">
        {label}
      </p>
      <motion.p
        key={String(value)}
        initial={{ scale: 1.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={
          "font-sentient text-2xl leading-none mt-1 " +
          (highlight ? "text-primary" : "text-foreground/85")
        }
      >
        {value}
      </motion.p>
    </div>
  );
}

function iconFor(agent: string) {
  switch (agent) {
    case "cartographer":
      return Crosshair;
    case "auth":
      return Activity;
    case "evidence":
      return ShieldCheck;
    default:
      return Activity;
  }
}

function isAgentDone(agent: string, events: ScanEvent[], scanComplete: boolean): boolean {
  if (scanComplete) return true;
  const order = ["cartographer", "auth", "evidence"];
  const idx = order.indexOf(agent);
  if (idx === -1) return false;
  return events.some((e) => order.indexOf(e.agent_name) > idx);
}

function computeMetric(agent: string, events: ScanEvent[], findings: Finding[]): number | string {
  if (agent === "cartographer") {
    const routeEvents = events.filter((e) => e.event_type === "route");
    if (routeEvents.length > 0) return routeEvents.length;
    const summary = events.find((e) => e.event_type === "summary");
    if (summary?.message) {
      const m = summary.message.match(/Discovered\s+(\d+)\s+routes/i);
      if (m) return Number(m[1]);
    }
    return events.length === 0 ? "—" : 0;
  }
  if (agent === "auth") {
    const probes = events.filter((e) => e.event_type === "probe").length;
    if (probes > 0) return probes;
    const summary = events.find((e) => e.event_type === "summary");
    if (summary?.message) {
      const m = summary.message.match(/(\d+)\s+hypothes/i);
      if (m) return Number(m[1]);
    }
    return events.length === 0 ? "—" : 0;
  }
  if (agent === "evidence") {
    return findings.length || (events.length === 0 ? "—" : 0);
  }
  return "—";
}
