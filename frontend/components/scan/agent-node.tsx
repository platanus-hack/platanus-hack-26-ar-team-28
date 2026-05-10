"use client";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentTone = "cyan" | "orange" | "gold";

export interface AgentNodeData {
  agent: string;
  label: string;
  tone: AgentTone;
  icon: LucideIcon;
  description: string;
  // The most recent message coming from this agent in the scan stream.
  lastMessage?: string;
  // Total events emitted by this agent.
  eventCount: number;
  // Status the UI should reflect.
  status: "idle" | "active" | "done";
  // A few quantitative counters this agent owns (e.g., routes discovered).
  metric?: { label: string; value: number | string };
}

const TONE: Record<
  AgentTone,
  {
    border: string;
    glow: string;
    bg: string;
    text: string;
    iconBg: string;
    dot: string;
    ring: string;
  }
> = {
  cyan: {
    border: "border-cyan-500/40",
    glow: "shadow-cyan-500/30",
    bg: "bg-cyan-500/5",
    text: "text-cyan-300",
    iconBg: "bg-cyan-500/15",
    dot: "bg-cyan-400",
    ring: "ring-cyan-500/40",
  },
  orange: {
    border: "border-primary/40",
    glow: "shadow-primary/30",
    bg: "bg-primary/5",
    text: "text-primary",
    iconBg: "bg-primary/15",
    dot: "bg-primary",
    ring: "ring-primary/40",
  },
  gold: {
    border: "border-amber-400/40",
    glow: "shadow-amber-400/30",
    bg: "bg-amber-400/5",
    text: "text-amber-300",
    iconBg: "bg-amber-400/15",
    dot: "bg-amber-300",
    ring: "ring-amber-400/40",
  },
};

interface Props {
  data: AgentNodeData;
  // Animation delay in seconds for staggered boot.
  bootDelay?: number;
}

export function AgentNode({ data, bootDelay = 0 }: Props) {
  const t = TONE[data.tone];
  const Icon = data.icon;
  const active = data.status === "active";
  const done = data.status === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.55,
        delay: bootDelay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "relative border p-5 backdrop-blur-sm flex flex-col",
        t.border,
        t.bg,
        active && "shadow-glow",
        active && t.glow,
      )}
    >
      {/* Boot-up indicator: tiny "online" badge that materializes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: bootDelay + 0.4, duration: 0.3 }}
        className={cn(
          "absolute top-2 right-2 px-1.5 py-0.5 font-mono uppercase text-[8px] tracking-widest",
          done ? "text-emerald-300/70" : t.text,
        )}
      >
        {done ? "● done" : active ? "● live" : "○ idle"}
      </motion.div>

      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            "relative w-10 h-10 flex items-center justify-center",
            t.iconBg,
          )}
        >
          <Icon className={cn("w-5 h-5", t.text)} />
          {active && (
            <motion.div
              className={cn("absolute inset-0 ring-2", t.ring)}
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </div>
        <div>
          <p className={cn("font-mono uppercase text-[10px] tracking-widest", t.text)}>
            {data.label}
          </p>
          <p className="font-sentient text-base text-foreground capitalize">
            {data.agent}
          </p>
        </div>
      </div>

      <p className="font-mono text-[11px] text-foreground/50 leading-relaxed mb-4">
        {data.description}
      </p>

      {data.metric && (
        <div className={cn("border-t pt-3 mb-3 flex items-baseline justify-between", t.border)}>
          <span className="font-mono uppercase text-[10px] text-foreground/40 tracking-widest">
            {data.metric.label}
          </span>
          <motion.span
            key={String(data.metric.value)}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className={cn("font-sentient text-2xl", t.text)}
          >
            {data.metric.value}
          </motion.span>
        </div>
      )}

      {/* Live activity ticker */}
      <div className={cn("border-t pt-3 mt-auto min-h-[60px]", t.border)}>
        <div className="flex items-center gap-1 mb-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className={cn("w-1.5 h-1.5 rounded-full", t.dot)}
              animate={
                active
                  ? { opacity: [0.3, 1, 0.3] }
                  : { opacity: 0.25 }
              }
              transition={{
                duration: 1.0,
                delay: i * 0.18,
                repeat: active ? Infinity : 0,
              }}
            />
          ))}
          <span className="ml-auto font-mono text-[10px] text-foreground/40">
            {data.eventCount} event{data.eventCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="font-mono text-[11px] text-foreground/70 line-clamp-2 break-all min-h-[28px]">
          {data.lastMessage || (
            <span className="text-foreground/30">awaiting work…</span>
          )}
        </p>
      </div>
    </motion.div>
  );
}
