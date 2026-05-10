"use client";
/**
 * Trust Graph.
 *
 * Reads the `decision_trace` field of an mcp_event and animates a
 * source-chain → tool-call diagram. Sources appear sequentially with edges
 * drawing in; the lowest-trust contributing node flashes red (or just
 * pulses if the action was allowed) and the tool node gets a skull/lock
 * stamp on block.
 *
 * No external graph library — hand-laid out positions to keep the
 * animation perfectly tuneable.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Skull, ShieldCheck, Lock, Sparkles, AlertTriangle } from "lucide-react";
import { TRUST_SCORE, type SourceType } from "@/types/api";

type Decision =
  | "allow" | "allow_logged" | "block"
  | "require_approval" | "snapshot_first" | "sandbox_first"
  | "allow_readonly" | "require_strong_confirm" | "ask_clarify";

interface ChainNode {
  source_type: SourceType;
  source_path: string | null;
  trust_level: number;
  excerpt: string | null;
  suspicious_markers: string[];
}

export interface TrustGraphData {
  chain: ChainNode[];
  required_trust: number;
  effective_trust: number;
  matched_patterns: string[];
  latency_ms?: number;
}

interface Props {
  data: TrustGraphData;
  toolName: string;
  actionSummary: string;
  decision: Decision;
  reason: string;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  system_policy: "System policy",
  org_policy: "Org policy",
  user_instruction: "User instruction",
  project_policy: "Project policy",
  repo_code: "Repo code",
  test_file: "Test file",
  documentation: "Documentation",
  web_content: "Web content",
  tool_output: "Tool output",
  model_plan: "Model plan",
};

function trustToTone(trust: number, suspicious: boolean): string {
  if (suspicious) return "border-red-500/70 bg-red-500/10 text-red-200";
  if (trust >= 75) return "border-emerald-500/50 bg-emerald-500/5 text-emerald-200";
  if (trust >= 45) return "border-primary/50 bg-primary/5 text-foreground";
  return "border-amber-400/60 bg-amber-400/5 text-amber-200";
}

function isBlocked(d: Decision): boolean {
  return d === "block";
}

export function TrustGraph({ data, toolName, actionSummary, decision, reason }: Props) {
  const { chain, required_trust, effective_trust, matched_patterns } = data;
  const blocked = isBlocked(decision);

  // Find the weakest contributing node (excluding model_plan floor) so we
  // can flash it red on a block.
  const contributing = chain.filter((n) => n.source_type !== "model_plan");
  const weakest = contributing.reduce<ChainNode | null>(
    (acc, n) => (acc == null || n.trust_level < acc.trust_level ? n : acc),
    null,
  );

  // Layout: 1 column of source nodes on the left, tool node on the right,
  // edges connecting each source → tool. Edges animate in sequence.
  return (
    <div className="border border-border bg-background/40 backdrop-blur-sm">
      <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
        <div>
          <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-1">
            Pillar I — Trust Graph
          </p>
          <h3 className="font-sentient text-xl text-foreground">
            {blocked ? "Blocked tool call" : "Approved tool call"}
          </h3>
          <p className="font-mono text-xs text-foreground/50 mt-1">
            {data.latency_ms != null && (
              <span>decided in {data.latency_ms}ms · </span>
            )}
            effective trust <span className="text-foreground">{effective_trust}</span>
            {" "}vs required <span className="text-foreground">{required_trust}</span>
          </p>
        </div>
        <DecisionBadge decision={decision} />
      </header>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_auto_minmax(0,1.6fr)] gap-6 items-stretch">
          {/* Source chain (left column) */}
          <div className="space-y-2">
            <p className="font-mono uppercase text-[10px] text-foreground/40 tracking-widest mb-2">
              Provenance chain
            </p>
            <ul className="space-y-2">
              <AnimatePresence>
                {chain.map((node, i) => {
                  const isWeakest =
                    weakest != null &&
                    node.source_type === weakest.source_type &&
                    node.source_path === weakest.source_path &&
                    node.trust_level === weakest.trust_level;
                  const flashRed = blocked && isWeakest;
                  return (
                    <motion.li
                      key={`${node.source_type}-${node.source_path ?? i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.25,
                        delay: i * 0.16,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className={[
                        "border px-3 py-2 relative overflow-hidden",
                        trustToTone(node.trust_level, node.suspicious_markers.length > 0),
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono uppercase text-[10px] tracking-widest opacity-80">
                          {SOURCE_LABELS[node.source_type]}
                        </span>
                        <span className="ml-auto font-mono text-[10px] opacity-60">
                          trust {node.trust_level}
                          {node.suspicious_markers.length > 0 ? " ⚠" : ""}
                        </span>
                      </div>
                      <p className="font-mono text-xs truncate">
                        {node.source_path ?? "—"}
                      </p>
                      {node.suspicious_markers.length > 0 && (
                        <p className="font-mono text-[10px] mt-1 text-red-300/80">
                          markers: {node.suspicious_markers.join(", ")}
                        </p>
                      )}
                      {flashRed && (
                        <motion.div
                          aria-hidden
                          className="absolute inset-0 bg-red-500/20 pointer-events-none"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0, 0.7, 0.0] }}
                          transition={{
                            duration: 0.9,
                            delay: chain.length * 0.16 + 0.1,
                            repeat: 1,
                          }}
                        />
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>

          {/* Animated edge column (mid) */}
          <div className="hidden md:flex flex-col items-center justify-center min-w-[80px]">
            <svg
              width="80"
              height="100%"
              viewBox="0 0 80 100"
              preserveAspectRatio="none"
              className="h-full"
            >
              <motion.path
                d="M 0 50 C 30 50, 50 50, 80 50"
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                stroke={blocked ? "rgb(239 68 68 / 0.7)" : "rgb(243 185 143 / 0.6)"}
                strokeDasharray={blocked ? "4 4" : "0"}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: 0.5,
                  delay: chain.length * 0.16 + 0.05,
                  ease: "easeInOut",
                }}
              />
              {blocked && (
                <motion.circle
                  cx="40"
                  cy="50"
                  r="3"
                  fill="rgb(239 68 68)"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 1] }}
                  transition={{
                    duration: 0.4,
                    delay: chain.length * 0.16 + 0.5,
                  }}
                />
              )}
            </svg>
          </div>

          {/* Tool / decision node (right) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.45,
              delay: chain.length * 0.16 + 0.25,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={[
              "relative border px-4 py-4",
              blocked
                ? "border-red-500/70 bg-red-500/5"
                : "border-primary/50 bg-primary/5",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 mb-2">
              {blocked ? (
                <Skull className="w-4 h-4 text-red-400" />
              ) : decision === "snapshot_first" ? (
                <Lock className="w-4 h-4 text-amber-300" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
              <span className="font-mono uppercase text-[10px] tracking-widest opacity-80">
                {toolName}
              </span>
            </div>
            <p className="font-mono text-sm text-foreground break-all leading-relaxed">
              {actionSummary}
            </p>
            {matched_patterns.length > 0 && (
              <p className="font-mono text-[10px] mt-2 text-amber-300/80 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                matched: {matched_patterns.join(", ")}
              </p>
            )}
            {blocked && (
              <motion.div
                initial={{ scale: 0, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{
                  duration: 0.45,
                  delay: chain.length * 0.16 + 0.7,
                  type: "spring",
                  stiffness: 240,
                }}
                className="absolute -top-3 -right-3 px-2 py-0.5 border-2 border-red-500/80 bg-background font-mono uppercase text-[10px] text-red-300 tracking-widest"
                aria-label="Blocked stamp"
              >
                Blocked
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Reason paragraph */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: chain.length * 0.16 + 0.9 }}
          className="mt-6 border border-border bg-background/30 px-4 py-3"
        >
          <p className="font-mono uppercase text-[10px] text-foreground/40 tracking-widest mb-1">
            Decision rationale
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed">{reason}</p>
        </motion.div>
      </div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: Decision }) {
  const map: Record<Decision, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
    allow: { label: "ALLOW", cls: "border-emerald-500/50 text-emerald-300", icon: ShieldCheck },
    allow_logged: { label: "ALLOW + LOG", cls: "border-emerald-500/50 text-emerald-300", icon: ShieldCheck },
    allow_readonly: { label: "ALLOW (RO)", cls: "border-emerald-500/50 text-emerald-300", icon: ShieldCheck },
    block: { label: "BLOCKED", cls: "border-red-500/70 text-red-300", icon: Skull },
    require_approval: { label: "APPROVAL", cls: "border-amber-400/60 text-amber-300", icon: Sparkles },
    snapshot_first: { label: "SNAPSHOT FIRST", cls: "border-amber-400/60 text-amber-300", icon: Lock },
    sandbox_first: { label: "SANDBOX FIRST", cls: "border-amber-400/60 text-amber-300", icon: Lock },
    require_strong_confirm: { label: "CONFIRM", cls: "border-amber-400/60 text-amber-300", icon: Sparkles },
    ask_clarify: { label: "CLARIFY", cls: "border-cyan-400/60 text-cyan-300", icon: Sparkles },
  };
  const e = map[decision] ?? map.allow;
  const Icon = e.icon;
  return (
    <span
      className={[
        "border px-2.5 py-1 font-mono uppercase text-[10px] tracking-widest flex items-center gap-1.5",
        e.cls,
      ].join(" ")}
    >
      <Icon className="w-3 h-3" />
      {e.label}
    </span>
  );
}

// Extract the engine's serialized DecisionTrace from an MCPEvent row.
export function parseDecisionTrace(
  raw: Record<string, unknown> | null | undefined,
): TrustGraphData | null {
  if (!raw) return null;
  const chain = (raw["chain"] as ChainNode[] | undefined) ?? [];
  if (chain.length === 0) return null;
  return {
    chain,
    required_trust: (raw["required_trust"] as number | undefined) ?? 0,
    effective_trust:
      (raw["effective_trust"] as number | undefined) ??
      (chain.find((n) => n.source_type !== "model_plan")?.trust_level ?? TRUST_SCORE.user_instruction),
    matched_patterns: (raw["matched_patterns"] as string[] | undefined) ?? [],
    latency_ms: raw["latency_ms"] as number | undefined,
  };
}
