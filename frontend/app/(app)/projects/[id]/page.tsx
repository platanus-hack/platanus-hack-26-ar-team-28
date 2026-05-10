import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/dashboard/section-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PairProject } from "@/components/dashboard/pair-project";
import { ScanLauncher } from "@/components/scan/scan-launcher";
import { McpEventFeed } from "@/components/mcp/mcp-event-feed";
import { ApprovalsFeed } from "@/components/approval/approvals-feed";
import { Network } from "lucide-react";
import type { Project } from "@/types/api";

// Next.js 16: page params are a Promise.
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Mark stale runners offline before reading the project (idempotent RPC).
  // Without this the pair card would say "Online" for a runner that died.
  await supabase.rpc("sweep_stale_runners");

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single<Project>();

  if (!project) notFound();

  const { data: link } = await supabase
    .from("project_runners")
    .select("runner_id, runners(status)")
    .eq("project_id", id)
    .limit(1)
    .single();
  const runnerStatus = (link?.runners as { status?: string } | undefined)?.status;
  const hasOnlineRunner = runnerStatus === "online";

  return (
    <div className="container py-8 max-w-[1700px] space-y-8">
      <div>
        <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-2">
          // Project
        </p>
        <h1 className="font-sentient text-4xl text-foreground">{project.name}</h1>
        <p className="font-mono text-xs text-foreground/50 mt-2">
          {project.framework ?? "Framework: pending discovery"} ·{" "}
          {project.local_url ?? "URL: pending discovery"} · environment:{" "}
          {project.environment}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Local runner" subtitle="Pair a machine to enable scans, tool audit, snapshots">
            <PairProject projectId={project.id} />
          </SectionCard>

          <SectionCard
            title="Tool audit"
            subtitle="Tool calls supervised by the trust gateway"
            pillar={1}
          >
            <McpEventFeed projectId={project.id} />
          </SectionCard>

          <SectionCard
            title="Red-team scans"
            subtitle="Verified vulnerabilities with evidence"
            pillar={2}
          >
            <ScanLauncher
              projectId={project.id}
              hasRunner={hasOnlineRunner}
              initialTargetUrl={project.local_url}
            />
          </SectionCard>

          <SectionCard
            title="Approvals & snapshots"
            subtitle="Reversible state captured before risky agent actions"
            pillar={3}
          >
            <ApprovalsFeed projectId={project.id} />
          </SectionCard>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <div className="border border-border bg-background/40 p-5 space-y-3 backdrop-blur-sm">
            <p className="font-mono uppercase text-[10px] text-foreground/40 tracking-widest">
              Project metadata
            </p>
            <Field label="Created" value={new Date(project.created_at).toLocaleString()} />
            <Field label="Repo alias" value={project.repo_alias ?? "—"} />
            <Field label="Framework" value={project.framework ?? "auto-detect on pair"} />
            <Field label="Local URL" value={project.local_url ?? "auto-detect on pair"} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] text-foreground/40 uppercase tracking-wider">
        {label}
      </p>
      <p className="font-mono text-xs text-foreground/80 mt-1 break-all">{value}</p>
    </div>
  );
}
