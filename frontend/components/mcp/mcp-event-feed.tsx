"use client";
/**
 * Live MCP event feed — terminal-style row list, Supabase Realtime backed.
 * Each row is clickable and expands the Trust Graph + decision card below.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Network, ShieldCheck, Skull } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Decision, MCPEvent } from "@/types/api";
import { TrustGraph, parseDecisionTrace } from "@/components/trust/trust-graph";

interface Props {
  projectId: string;
}

const DECISION_TONE: Record<Decision, { dot: string; label: string }> = {
  allow: { dot: "bg-emerald-400", label: "allow" },
  allow_logged: { dot: "bg-emerald-400", label: "allow+log" },
  allow_readonly: { dot: "bg-emerald-400", label: "allow(ro)" },
  block: { dot: "bg-red-400", label: "BLOCKED" },
  require_approval: { dot: "bg-amber-300", label: "approval" },
  snapshot_first: { dot: "bg-amber-300", label: "snapshot" },
  sandbox_first: { dot: "bg-amber-300", label: "sandbox" },
  require_strong_confirm: { dot: "bg-amber-300", label: "confirm" },
  ask_clarify: { dot: "bg-cyan-300", label: "clarify" },
};

export function McpEventFeed({ projectId }: Props) {
  const [events, setEvents] = useState<MCPEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const supabase = createClient();

    async function backfill() {
      const { data } = await supabase
        .from("mcp_events")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<MCPEvent[]>();
      if (!data) return;
      for (const e of data) seen.current.add(e.id);
      setEvents(data);
      // Auto-select most recent block (or just the most recent) so the graph
      // is visible immediately after a demo replay.
      if (data.length > 0) {
        const firstBlock = data.find((e) => e.decision === "block");
        setSelected(firstBlock?.id ?? data[0].id);
      }
    }

    void backfill();

    const ch = supabase
      .channel(`mcp_events:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mcp_events",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as MCPEvent;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);
          setEvents((prev) => [row, ...prev]);
          // Auto-promote the latest block to selected for the wow.
          if (row.decision === "block") setSelected(row.id);
        },
      )
      .subscribe();

    // Polling fallback so the demo never feels stuck.
    const poll = window.setInterval(async () => {
      const { data } = await supabase
        .from("mcp_events")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<MCPEvent[]>();
      if (!data) return;
      const fresh = data.filter((e) => !seen.current.has(e.id));
      if (fresh.length > 0) {
        for (const e of fresh) seen.current.add(e.id);
        setEvents((prev) => [...fresh, ...prev]);
        const firstBlock = fresh.find((e) => e.decision === "block");
        if (firstBlock) setSelected(firstBlock.id);
      }
    }, 2000);

    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(poll);
    };
  }, [projectId]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selected) ?? null,
    [events, selected],
  );
  const trace = useMemo(
    () => (selectedEvent?.decision_trace ? parseDecisionTrace(selectedEvent.decision_trace) : null),
    [selectedEvent],
  );

  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <div className="border border-dashed border-border/60 px-6 py-10 text-center">
          <Network className="w-7 h-7 text-foreground/30 mx-auto mb-3" />
          <p className="font-sentient text-base text-foreground/80">No tool calls supervised yet</p>
          <p className="font-mono text-xs text-foreground/40 mt-2 max-w-md mx-auto">
            Pair a runner, install Claude Code hooks via{" "}
            <code className="bg-background/60 px-1">vibefence install --client claude-code</code>,
            then every Bash / Edit / Write / tool call will land here.
          </p>
        </div>
      ) : (
        <ul className="border border-border bg-background/30 divide-y divide-border max-h-[260px] overflow-y-auto font-mono text-xs">
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const tone = DECISION_TONE[e.decision] ?? DECISION_TONE.allow;
              const isSelected = e.id === selected;
              const blocked = e.decision === "block";
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setSelected(e.id)}
                  className={cn(
                    "px-3 py-2 cursor-pointer flex items-center gap-3 transition-colors",
                    isSelected ? "bg-primary/10" : "hover:bg-foreground/5",
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", tone.dot, blocked && "shadow-glow shadow-red-500/40")} />
                  <span className="text-foreground/40 w-16 shrink-0">
                    {new Date(e.created_at).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span
                    className={cn(
                      "uppercase tracking-wider w-20 shrink-0",
                      blocked ? "text-red-300" : "text-foreground/70",
                    )}
                  >
                    {tone.label}
                  </span>
                  <span className="text-foreground/80 shrink-0 w-32 truncate">{e.tool_name}</span>
                  <span className="text-foreground/60 truncate">{e.action_summary}</span>
                  {blocked ? (
                    <Skull className="w-3.5 h-3.5 text-red-400 ml-auto shrink-0" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/60 ml-auto shrink-0" />
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {selectedEvent && trace && (
        <TrustGraph
          key={selectedEvent.id}
          data={trace}
          toolName={selectedEvent.tool_name}
          actionSummary={selectedEvent.action_summary ?? "—"}
          decision={selectedEvent.decision}
          reason={selectedEvent.reason ?? ""}
        />
      )}
    </div>
  );
}
