import Link from "next/link";
import { FolderTree } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { Project } from "@/types/api";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Project[]>();

  return (
    <div className="container py-8 max-w-[1400px] space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-2">
            // Local project map
          </p>
          <h1 className="font-sentient text-3xl text-foreground">Projects</h1>
        </div>
        <Button asChild>
          <Link href="/projects/new">+ New project</Link>
        </Button>
      </div>

      {projects && projects.length > 0 ? (
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="block border border-border bg-background/40 backdrop-blur-sm p-5 hover:border-primary/40 transition-colors"
              >
                <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-2">
                  {p.framework ?? "Unknown framework"}
                </p>
                <h2 className="font-sentient text-xl text-foreground mb-1">{p.name}</h2>
                <p className="font-mono text-xs text-foreground/50">
                  {p.local_url ?? "No local URL detected"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FolderTree}
          title="No projects yet"
          description="Create a project, pair your local machine, and Vibefence will auto-discover the framework, ports, database, and test runner."
          action={
            <Button asChild>
              <Link href="/projects/new">Create your first project</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
