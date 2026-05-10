"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  snapshotId: string;
  status: string;
  className?: string;
}

export function RollbackButton({ snapshotId, status, className }: Props) {
  const [pending, startTransition] = useTransition();
  const [showStamp, setShowStamp] = useState(false);

  const isApplied = status === "applied" || status === "available";
  const isRolledBack = status === "rolled_back";
  const isPending = status === "rollback_pending";

  function trigger() {
    startTransition(async () => {
      const r = await fetch(`/api/snapshots/${snapshotId}/rollback-request`, {
        method: "POST",
      });
      if (!r.ok) {
        const err = (await r.json()) as { detail?: string; error?: string };
        toast.error(err.detail ?? err.error ?? "Failed to roll back");
        return;
      }
      // The actual rollback runs on the runner via heartbeat job pickup.
      // We optimistically show the RESTORED stamp once status flips to
      // rolled_back via realtime — see effect in parent.
      setShowStamp(true);
      window.setTimeout(() => setShowStamp(false), 2000);
      toast.success("Rollback requested");
    });
  }

  if (isRolledBack) {
    return (
      <div
        className={cn(
          "relative border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 font-mono uppercase text-[10px] tracking-widest text-emerald-300 inline-flex items-center gap-1.5",
          className,
        )}
      >
        <RotateCcw className="w-3 h-3" />
        Rolled back
      </div>
    );
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={pending || isPending || !isApplied}
        onClick={trigger}
        className={cn(
          "border px-3 py-1.5 font-mono uppercase text-[10px] tracking-widest inline-flex items-center gap-1.5 transition-colors",
          isPending
            ? "border-amber-400/40 text-amber-300 animate-pulse"
            : "border-amber-400/40 text-amber-200 hover:bg-amber-400/10",
          (pending || !isApplied) && "opacity-60 cursor-not-allowed",
        )}
      >
        <RotateCcw className="w-3 h-3" />
        {isPending ? "Restoring…" : "Rollback"}
      </button>

      <AnimatePresence>
        {showStamp && (
          <motion.span
            initial={{ y: -10, opacity: 0, rotate: -8 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25, type: "spring", stiffness: 300 }}
            className="pointer-events-none absolute -top-3 -right-3 px-2 py-0.5 border-2 border-emerald-500/80 bg-background font-mono uppercase text-[10px] text-emerald-300 tracking-widest"
          >
            RESTORE
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
