"use client";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Copy, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";
import { toast } from "sonner";
import type { Runner } from "@/types/api";

interface Props {
  projectId: string;
}

interface PairingState {
  code: string;
  expires_at: string;
}

export function PairProject({ projectId }: Props) {
  const [pairing, setPairing] = useState<PairingState | null>(null);
  const [pending, startTransition] = useTransition();
  const [runner, setRunner] = useState<Runner | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function fetchPaired() {
      // Sweep stale runners first so the UI never lies about liveness.
      await supabase.rpc("sweep_stale_runners");

      const { data } = await supabase
        .from("project_runners")
        .select("runner_id, runners(*)")
        .eq("project_id", projectId)
        .limit(1)
        .maybeSingle();
      if (!mounted) return;
      if (!data?.runners) {
        // No runner linked — clear if we had one before (e.g. unpaired).
        setRunner(null);
        return;
      }
      const r = data.runners as unknown as Runner;
      setRunner((prev) => {
        if (!prev && r.status === "online") {
          toast.success(`Runner ${r.machine_name} is online`);
          setPairing(null);
        }
        return r;
      });
    }

    void fetchPaired();

    // Realtime — primary path. Fires on project_runners INSERT once 0003 is applied.
    const channel = supabase
      .channel(`project_runners:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_runners",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void fetchPaired();
        },
      )
      .subscribe();

    // Polling fallback — if Realtime drops, we still converge within 2 s.
    const poll = window.setInterval(fetchPaired, 2000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [projectId]);

  function generateCode() {
    startTransition(async () => {
      const res = await fetch("/api/pairing/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        toast.error("Failed to generate pairing code");
        return;
      }
      const data = (await res.json()) as PairingState;
      setPairing(data);
    });
  }

  if (runner) {
    const online = runner.status === "online";
    return (
      <PairedRunnerCard runner={runner} online={online} />
    );
  }

  if (!pairing) {
    return (
      <div className="border border-dashed border-border/60 p-6 text-center space-y-4">
        <Server className="w-8 h-8 text-foreground/30 mx-auto" />
        <div>
          <p className="font-sentient text-lg text-foreground/80">Parea tu runner local</p>
          <p className="font-mono text-xs text-foreground/40 mt-2 max-w-sm mx-auto">
            Vibefence supervisa cada llamada a herramienta desde el momento del pareo.
            La evidencia sensible nunca sale de tu máquina.
          </p>
        </div>
        <details className="border border-border/40 bg-background/60 px-4 py-3 text-left max-w-sm mx-auto">
          <summary className="font-mono uppercase text-[10px] text-foreground/60 tracking-widest cursor-pointer">
            Don&apos;t have the agent yet?
          </summary>
          <div className="pt-3 space-y-2">
            <p className="font-mono text-[11px] text-foreground/60">
              Run this once on your machine. Requires Python 3.11+.
            </p>
            <code className="block bg-background border border-border p-2 font-mono text-[11px] text-foreground/80 break-all">
              <span className="text-primary">PS</span>&gt; irm https://vibefence-black.vercel.app/install.ps1 | iex
            </code>
            <code className="block bg-background border border-border p-2 font-mono text-[11px] text-foreground/80 break-all">
              <span className="text-primary">$</span> curl -fsSL https://vibefence-black.vercel.app/install.sh | sh
            </code>
          </div>
        </details>
        <Button onClick={generateCode} disabled={pending}>
          {pending ? "..." : "Generar código de pareo"}
        </Button>
      </div>
    );
  }

  const fullCmd = `vibefence pair ${pairing.code}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="border border-primary/30 bg-background/40 p-5 space-y-4 relative overflow-hidden"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-2">
            // Pairing code
          </p>
          <p className="font-mono text-3xl text-primary tracking-[0.2em]">{pairing.code}</p>
          <p className="font-mono text-[10px] text-foreground/40 uppercase tracking-wider mt-2">
            Expires {new Date(pairing.expires_at).toLocaleTimeString()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(fullCmd);
            toast.success("Copied pair command");
          }}
          className="border border-border px-2.5 py-1.5 font-mono uppercase text-[10px] tracking-widest text-foreground/70 hover:text-primary hover:border-primary/40 transition-colors inline-flex items-center gap-1.5"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>

      <div className="bg-background border border-border p-4 font-mono text-xs text-foreground/80 overflow-x-auto">
        <span className="text-primary">$</span> {fullCmd}
      </div>

      <div className="flex items-center gap-2 font-mono text-[10px] text-foreground/40 uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        Awaiting runner...
      </div>
    </motion.div>
  );
}


function PairedRunnerCard({ runner, online }: { runner: Runner; online: boolean }) {
  // Typewriter reveal of discovery metadata when the runner first comes online.
  const lines = [
    { label: "machine", value: runner.machine_name },
    { label: "os", value: runner.os ?? "unknown" },
    { label: "agent", value: `v${runner.version ?? "?"}` },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="border border-primary/40 bg-primary/5 p-5 backdrop-blur-sm relative overflow-hidden"
    >
      <div className="flex items-center gap-3 mb-3">
        <Server className="w-4 h-4 text-primary" />
        <p className="font-mono uppercase text-[10px] text-primary tracking-widest">
          Runner paired
        </p>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={
              online
                ? "w-2 h-2 rounded-full bg-primary shadow-glow shadow-primary"
                : "w-2 h-2 rounded-full bg-foreground/30"
            }
          />
          <span className="font-mono text-xs uppercase tracking-wider text-foreground/70">
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <p className="font-sentient text-xl text-foreground mb-3">
        {runner.machine_name}
      </p>

      <ul className="font-mono text-xs space-y-0.5">
        {lines.map((line, i) => (
          <motion.li
            key={line.label}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, delay: 0.15 + i * 0.08 }}
            className="flex gap-3"
          >
            <span className="text-foreground/40 w-16 uppercase tracking-wider">
              {line.label}
            </span>
            <span className="text-foreground/80">{line.value}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}
