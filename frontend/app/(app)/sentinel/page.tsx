import { createClient } from "@/lib/supabase/server";
import { SentinelLive } from "@/components/sentinel/sentinel-live";

interface ProjectOption {
  id: string;
  name: string;
  hasOnlineRunner: boolean;
}

export default async function SentinelPage() {
  const supabase = await createClient();
  await supabase.rpc("sweep_stale_runners");

  // List user's projects with whether they have an online runner.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, project_runners(runner_id, runners(status))")
    .order("created_at", { ascending: false });

  const options: ProjectOption[] = ((projects ?? []) as Array<{
    id: string;
    name: string;
    project_runners?: Array<{
      runners: { status: string } | { status: string }[] | null;
    }>;
  }>).map((p) => {
    const links = p.project_runners ?? [];
    const hasOnlineRunner = links.some((l) => {
      const r = l.runners;
      if (!r) return false;
      if (Array.isArray(r)) return r.some((x) => x.status === "online");
      return r.status === "online";
    });
    return { id: p.id, name: p.name, hasOnlineRunner };
  });

  // Default to the first project with an online runner; else the most-recent project.
  const initialProject =
    options.find((p) => p.hasOnlineRunner)?.id ?? options[0]?.id ?? null;

  return <SentinelLive projects={options} initialProjectId={initialProject} />;
}
