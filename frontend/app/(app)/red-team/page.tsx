import { createClient } from "@/lib/supabase/server";
import { RedTeamLauncher } from "@/components/red-team/red-team-launcher";
import type { Project, Runner } from "@/types/api";

interface RunnerRow extends Runner {
  // The first project the runner is linked to (denormalized for the picker).
  project_id: string | null;
  project_name: string | null;
}

export default async function RedTeamPage() {
  const supabase = await createClient();

  // Sweep stale runners before listing — same idempotent RPC the dashboard uses.
  await supabase.rpc("sweep_stale_runners");

  // Pull all runners owned by this user, with their first linked project (if any).
  // We deliberately keep this small: the runner is the unit of choice, not the project.
  const { data: runners } = await supabase
    .from("runners")
    .select("*, project_runners(project_id, projects(id, name))")
    .order("status", { ascending: true })  // online first ('o' < anything later)
    .order("last_seen_at", { ascending: false, nullsFirst: false });

  const flat: RunnerRow[] =
    (runners ?? []).map((r) => {
      const link = (r.project_runners as Array<{ projects: Project }> | undefined)?.[0];
      const proj = link?.projects;
      const { project_runners: _, ...rest } = r as { project_runners: unknown } & Runner;
      return {
        ...(rest as Runner),
        project_id: proj?.id ?? null,
        project_name: proj?.name ?? null,
      };
    });

  return <RedTeamLauncher runners={flat} />;
}
