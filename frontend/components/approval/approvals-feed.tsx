"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ApprovalCard } from "@/components/approval/approval-card";
import type { Approval, Snapshot } from "@/types/api";
import { EmptyState } from "@/components/dashboard/empty-state";

interface Props {
  projectId: string;
}

export function ApprovalsFeed({ projectId }: Props) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function refresh() {
      const [aRes, sRes] = await Promise.all([
        supabase
          .from("approvals")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(10)
          .returns<Approval[]>(),
        supabase
          .from("snapshots")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(10)
          .returns<Snapshot[]>(),
      ]);
      if (aRes.data) setApprovals(aRes.data);
      if (sRes.data) setSnapshots(sRes.data);
    }

    void refresh();

    const ch = supabase
      .channel(`project_approvals:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "approvals",
          filter: `project_id=eq.${projectId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "snapshots",
          filter: `project_id=eq.${projectId}`,
        },
        () => void refresh(),
      )
      .subscribe();

    // Polling fallback so the demo doesn't depend on realtime alone.
    const poll = window.setInterval(refresh, 2000);

    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(poll);
    };
  }, [projectId]);

  if (approvals.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No approvals yet"
        description="When the trust gateway intercepts a high-impact action it will appear here with a sandbox diff and rollback option."
      />
    );
  }

  // Show only the most recent approval as a card.
  const top = approvals[0];
  // Pair with a database snapshot. mcp_event_id correlation is the
  // canonical pairing; approximation here is the most recent database
  // snapshot, which matches when there is one in-flight approval.
  const snap = snapshots.find((s) => s.type === "database") ?? null;

  return (
    <div className="space-y-3">
      <ApprovalCard approval={top} snapshot={snap} />
      {approvals.length > 1 && (
        <p className="font-mono text-[10px] text-foreground/40 text-center">
          + {approvals.length - 1} earlier approval{approvals.length === 2 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
