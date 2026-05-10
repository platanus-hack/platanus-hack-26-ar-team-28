import { Server } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/dashboard/section-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { Runner } from "@/types/api";

export default async function RunnersPage() {
  const supabase = await createClient();
  const { data: runners } = await supabase
    .from("runners")
    .select("*")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .returns<Runner[]>();

  return (
    <div className="container py-8 max-w-[1400px] space-y-6">
      <div>
        <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-2">
          // Local runners
        </p>
        <h1 className="font-sentient text-3xl text-foreground">Runners</h1>
      </div>

      <SectionCard title="Paired machines">
        {runners && runners.length > 0 ? (
          <ul className="divide-y divide-border">
            {runners.map((r) => {
              const online = r.status === "online";
              return (
                <li key={r.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      className={
                        online
                          ? "w-2 h-2 rounded-full bg-primary shadow-glow shadow-primary"
                          : "w-2 h-2 rounded-full bg-foreground/30"
                      }
                    />
                    <div>
                      <p className="font-sentient text-lg text-foreground">{r.machine_name}</p>
                      <p className="font-mono text-xs text-foreground/50 mt-1">
                        {r.os ?? "?"} · v{r.version ?? "?"}
                        {r.last_seen_at && ` · last seen ${new Date(r.last_seen_at).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs uppercase tracking-wider text-foreground/70">
                    {r.status}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Server}
            title="No runners paired"
            description="Open any project, generate a pairing code, and run `vibefence pair <code>` on the machine you want to manage."
          />
        )}
      </SectionCard>
    </div>
  );
}
