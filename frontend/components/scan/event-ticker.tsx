"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { ScanEvent } from "@/types/api";
import { cn } from "@/lib/utils";

const AGENT_TONE: Record<string, string> = {
  cartographer: "text-cyan-300",
  auth: "text-primary",
  evidence: "text-amber-300",
  scope: "text-foreground/60",
  scan: "text-foreground/60",
};

interface Props {
  events: ScanEvent[];
  // Cap how many lines to show; older lines fade off the top.
  maxLines?: number;
}

export function EventTicker({ events, maxLines = 8 }: Props) {
  const tail = events.slice(-maxLines);
  return (
    <div className="border border-border bg-background/30 backdrop-blur-sm">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-glow shadow-primary" />
        <p className="font-mono uppercase text-[10px] tracking-widest text-foreground/60">
          Activity stream · {events.length} event{events.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="px-3 py-2 min-h-[140px] max-h-[240px] overflow-y-auto font-mono text-[11px] space-y-0.5">
        <AnimatePresence initial={false}>
          {tail.length === 0 && (
            <p className="text-foreground/30">awaiting events…</p>
          )}
          {tail.map((e) => {
            const tone = AGENT_TONE[e.agent_name] ?? "text-foreground/60";
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-start gap-2"
              >
                <span className="text-foreground/30 w-12 shrink-0">
                  {new Date(e.created_at).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className={cn("uppercase tracking-wider w-24 shrink-0", tone)}>
                  {e.agent_name}
                </span>
                <span className="text-foreground/40 w-14 shrink-0">{e.event_type}</span>
                <span className="text-foreground/85 break-all">{e.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
