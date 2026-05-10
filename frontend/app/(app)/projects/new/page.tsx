import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

async function createProject(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, name })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create project");
  redirect(`/projects/${data.id}`);
}

export default function NewProjectPage() {
  return (
    <div className="container py-8 max-w-2xl space-y-6">
      <div>
        <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-2">
          // Provision a project
        </p>
        <h1 className="font-sentient text-3xl text-foreground">New project</h1>
        <p className="font-mono text-xs text-foreground/50 mt-2">
          Give it a name. After creation you&rsquo;ll get a pairing code so your local agent can map this project automatically.
        </p>
      </div>

      <form action={createProject} className="border border-primary/20 bg-background/40 backdrop-blur-sm p-6 space-y-5">
        <div className="space-y-2">
          <label htmlFor="name" className="block font-mono uppercase text-xs text-foreground/60 tracking-wider">
            Project name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="VibeCRM"
            className="w-full bg-background border border-border px-4 h-12 font-mono text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">Create project</Button>
          <Button asChild variant="outline">
            <Link href="/projects">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
