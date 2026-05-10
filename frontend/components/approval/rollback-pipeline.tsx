"use client";
/**
 * Animated rollback pipeline. Shows the actual journey a rollback request
 * takes — Dashboard → Cloud → Runner → Database — driven by the live
 * snapshot.status from Supabase Realtime, plus a forced minimum animation
 * pace so each step is visible long enough for an audience to read.
 *
 * States:
 *   - "rollback_pending"  → pipeline animates through stages
 *   - "rolled_back"       → all steps shown as done, RESTORED stamp shows
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, Server, Database, MonitorCog, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type StepKey = "dashboard" | "cloud" | "runner" | "database";

const STEPS: { key: StepKey; label: string; icon: typeof Cloud }[] = [
  { key: "dashboard", label: "Dashboard", icon: MonitorCog },
  { key: "cloud", label: "Cloud", icon: Cloud },
  { key: "runner", label: "Runner", icon: Server },
  { key: "database", label: "Database", icon: Database },
];

interface Props {
  /** snapshot.status — drives the final "done" transition */
  status: string;
  className?: string;
}

const STEP_INTERVAL_MS = 600;

export function RollbackPipeline({ status, className }: Props) {
  // 0..3 = active step. -1 = hasn't started yet.
  const [activeIdx, setActiveIdx] = useState(0);
  const isDone = status === "rolled_back";

  useEffect(() => {
    if (isDone) {
      setActiveIdx(STEPS.length); // all done
      return;
    }
    // Advance one step every STEP_INTERVAL_MS, holding at the last step
    // until the real "rolled_back" signal arrives via Realtime.
    const t = setInterval(() => {
      setActiveIdx((i) => Math.min(STEPS.length - 1, i + 1));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(t);
  }, [isDone]);

  return (
    <div
      className={cn(
        "border bg-background/60 backdrop-blur-sm p-4 space-y-3 relative overflow-hidden",
        isDone
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-amber-400/40",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isDone ? "bg-emerald-400" : "bg-amber-300 animate-pulse",
            )}
          />
          <p
            className={cn(
              "font-mono uppercase text-[10px] tracking-widest",
              isDone ? "text-emerald-300" : "text-amber-300",
            )}
          >
            {isDone ? "Schema restored from snapshot" : "Reversing through the trust gateway…"}
          </p>
        </div>
        <AnimatePresence>
          {isDone && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.35, type: "spring", stiffness: 280 }}
              className="px-2 py-0.5 border-2 border-emerald-500/80 bg-background font-mono uppercase text-[10px] text-emerald-300 tracking-widest"
            >
              RESTORED
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Pipeline */}
      <div className="flex items-center w-full">
        {STEPS.map((step, i) => {
          const stepDone = isDone || i < activeIdx;
          const stepActive = !isDone && i === activeIdx;
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-initial">
              {/* node */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <motion.div
                  className={cn(
                    "relative w-9 h-9 rounded-full border-2 flex items-center justify-center",
                    stepDone
                      ? "border-emerald-500/70 bg-emerald-500/10"
                      : stepActive
                        ? "border-amber-400 bg-amber-400/10"
                        : "border-border/60 bg-background/40",
                  )}
                  animate={
                    stepActive
                      ? { scale: [1, 1.08, 1], boxShadow: ["0 0 0 rgba(251,191,36,0)", "0 0 16px rgba(251,191,36,0.4)", "0 0 0 rgba(251,191,36,0)"] }
                      : { scale: 1 }
                  }
                  transition={
                    stepActive
                      ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.3 }
                  }
                >
                  <AnimatePresence mode="wait">
                    {stepDone ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.25, type: "spring", stiffness: 320 }}
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="icon"
                        initial={{ scale: 1 }}
                        animate={{ scale: 1 }}
                      >
                        <Icon
                          className={cn(
                            "w-4 h-4",
                            stepActive ? "text-amber-300" : "text-foreground/40",
                          )}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                <span
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-widest whitespace-nowrap",
                    stepDone
                      ? "text-emerald-300/80"
                      : stepActive
                        ? "text-amber-300"
                        : "text-foreground/30",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* connector to next node */}
              {i < STEPS.length - 1 && (
                <div className="relative flex-1 h-0.5 bg-border/40 mx-2 -mt-4 overflow-hidden">
                  <motion.div
                    className={cn(
                      "absolute inset-0 origin-left",
                      stepDone
                        ? "bg-emerald-500/70"
                        : stepActive
                          ? "bg-gradient-to-r from-amber-400 to-amber-400/30"
                          : "bg-transparent",
                    )}
                    initial={{ scaleX: 0 }}
                    animate={{
                      scaleX: stepDone ? 1 : stepActive ? 0.6 : 0,
                    }}
                    transition={{ duration: STEP_INTERVAL_MS / 1000, ease: "easeInOut" }}
                  />
                  {stepActive && (
                    <motion.div
                      className="absolute top-0 bottom-0 w-2 bg-amber-300/80 blur-[2px]"
                      initial={{ left: "0%" }}
                      animate={{ left: ["0%", "100%"] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Active-step caption */}
      <div className="font-mono text-[10px] text-foreground/50 min-h-[1em]">
        {isDone ? (
          <span className="text-emerald-300/80">
            ✓ legacy_role column recovered from <span className="text-emerald-300">vibefence_snap_*</span>. ALTER TABLE ADD COLUMN replayed against the live schema.
          </span>
        ) : (
          <ActiveCaption idx={activeIdx} />
        )}
      </div>
    </div>
  );
}

function ActiveCaption({ idx }: { idx: number }) {
  const captions = [
    "Posting rollback request to /api/snapshots/<id>/rollback-request…",
    "Cloud queued an apply_rollback job for the paired runner.",
    "Runner claimed the job on heartbeat. Reading snapshot metadata…",
    "Replaying ALTER TABLE ADD COLUMN against the live schema…",
  ];
  const text = captions[Math.min(idx, captions.length - 1)] ?? "";
  return (
    <motion.span
      key={idx}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      {text}
    </motion.span>
  );
}
