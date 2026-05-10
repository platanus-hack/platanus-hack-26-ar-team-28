"use client";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Check, X, Lock, Camera } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SandboxDiff, type SandboxResult } from "@/components/approval/sandbox-diff";
import { RollbackButton } from "@/components/approval/rollback-button";
import { RollbackPipeline } from "@/components/approval/rollback-pipeline";
import type { Approval, Snapshot } from "@/types/api";

interface Props {
  approval: Approval;
  snapshot: Snapshot | null;
}

export function ApprovalCard({ approval, snapshot }: Props) {
  const [pending, startTransition] = useTransition();
  const [showDiff, setShowDiff] = useState(true);

  const result = (approval.sandbox_result ?? null) as SandboxResult | null;
  const isPending = approval.status === "pending";
  const isApproved = approval.status === "approved";
  const isDenied = approval.status === "denied";

  const tone = isPending
    ? "border-amber-400/60 bg-amber-400/5"
    : isApproved
      ? "border-primary/60 bg-primary/5"
      : "border-foreground/30 bg-foreground/5";

  function approve() {
    startTransition(async () => {
      const r = await fetch(`/api/approvals/${approval.id}/approve`, { method: "POST" });
      if (!r.ok) {
        const err = (await r.json()) as { detail?: string; error?: string };
        toast.error(err.detail ?? err.error ?? "Failed to approve");
        return;
      }
      toast.success("Approved — runner will apply.");
    });
  }

  function deny() {
    startTransition(async () => {
      const r = await fetch(`/api/approvals/${approval.id}/deny`, { method: "POST" });
      if (!r.ok) {
        const err = (await r.json()) as { detail?: string; error?: string };
        toast.error(err.detail ?? err.error ?? "Failed to deny");
        return;
      }
      toast("Denied.");
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "border backdrop-blur-sm",
        tone,
      )}
    >
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-inherit">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isPending ? "bg-amber-300 animate-pulse" : isApproved ? "bg-primary" : "bg-foreground/40",
              )}
            />
            <p className={cn(
              "font-mono uppercase text-[10px] tracking-widest",
              isPending ? "text-amber-300" : isApproved ? "text-primary" : "text-foreground/60",
            )}>
              Pillar III · {isPending ? "Approval pending" : isApproved ? "Migration applied" : "Denied"}
              {approval.risk_level && ` · risk ${approval.risk_level}`}
            </p>
          </div>
          <h3 className="font-sentient text-xl text-foreground">
            High-impact action gated
          </h3>
          <p className="font-mono text-xs text-foreground/60 break-all">
            {approval.requested_action}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {snapshot && (
            <span className="border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 font-mono uppercase text-[10px] tracking-widest text-emerald-300 inline-flex items-center gap-1.5">
              <Camera className="w-3 h-3" />
              Snapshot
            </span>
          )}
        </div>
      </header>

      <div className="p-5 space-y-4">
        {/* Sandbox visualization */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono uppercase text-[10px] text-foreground/40 tracking-widest">
              Sandbox result
            </p>
            <button
              onClick={() => setShowDiff((v) => !v)}
              className="font-mono uppercase text-[10px] text-foreground/40 hover:text-foreground tracking-widest"
            >
              {showDiff ? "hide diff" : "show diff"}
            </button>
          </div>
          {showDiff && <SandboxDiff result={result} />}
        </div>

        {/* Action footer — collapses into the rollback pipeline once a
            rollback is in flight (or already complete). */}
        {snapshot && (snapshot.status === "rollback_pending" || snapshot.status === "rolled_back") ? (
          <div className="pt-2 border-t border-inherit">
            <RollbackPipeline status={snapshot.status} />
          </div>
        ) : (
          <div className="flex items-center justify-between pt-2 border-t border-inherit">
            <div className="flex items-center gap-2">
              {snapshot && (
                <RollbackButton snapshotId={snapshot.id} status={snapshot.status} />
              )}
            </div>
            <div className="flex items-center gap-2">
              {isPending && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={deny}
                    disabled={pending}
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Deny
                  </Button>
                  <Button size="sm" onClick={approve} disabled={pending}>
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Approve
                  </Button>
                </>
              )}
              {isApproved && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-primary/40 bg-primary/5 font-mono uppercase text-[10px] tracking-widest text-primary">
                  <Lock className="w-3 h-3" />
                  Applied — rollback available
                </span>
              )}
              {isDenied && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/30 font-mono uppercase text-[10px] tracking-widest text-foreground/60">
                  Denied
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
