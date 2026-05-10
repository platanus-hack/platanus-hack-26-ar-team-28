"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Snapshot } from "@/types/api";
import { RollbackButton } from "@/components/approval/rollback-button";

interface Props {
  projectId: string;
}

export function SnapshotsList({ projectId }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let stop = false;

    async function refresh() {
      const { data } = await supabase
        .from("snapshots")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<Snapshot[]>();
      if (!stop && data) setSnapshots(data);
    }

    void refresh();

    const ch = supabase
      .channel(`sentinel_snapshots:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snapshots", filter: `project_id=eq.${projectId}` },
        () => void refresh(),
      )
      .subscribe();

    const poll = window.setInterval(refresh, 2000);

    return () => {
      stop = true;
      supabase.removeChannel(ch);
      window.clearInterval(poll);
    };
  }, [projectId]);

  return (
    <div className="border border-border bg-background/30 backdrop-blur-sm">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Camera className="w-3.5 h-3.5 text-primary/70" />
        <p className="font-mono uppercase text-[10px] tracking-widest text-foreground/60">
          Recent snapshots · {snapshots.length}
        </p>
      </header>
      {snapshots.length === 0 ? (
        <p className="px-4 py-6 font-mono text-xs text-foreground/40 text-center">
          No snapshots yet. They&apos;re created automatically before high-impact tool actions.
        </p>
      ) : (
        <ul className="divide-y divide-border max-h-[260px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {snapshots.map((s) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="px-4 py-3 flex items-center justify-between gap-4 font-mono text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-foreground/40 w-16 shrink-0">
                    {new Date(s.created_at).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className="uppercase text-primary/70 tracking-wider w-16 shrink-0">
                    {s.type}
                  </span>
                  <span className="text-foreground/65 truncate">
                    {(s.metadata as { snap_schema?: string } | null)?.snap_schema ??
                      s.local_reference}
                  </span>
                  {s.size_bytes != null && (
                    <span className="text-foreground/40 shrink-0">
                      {(s.size_bytes / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="uppercase tracking-wider text-foreground/55 text-[10px]">
                    {s.status}
                  </span>
                  <RollbackButton snapshotId={s.id} status={s.status} />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
