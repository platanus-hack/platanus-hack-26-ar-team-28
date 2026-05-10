"use client";
/**
 * Post-signup install hint. Shows BOTH the Windows and macOS/Linux one-line
 * installers — no auto-detect, no toggle. Per design: a user signing up on
 * one machine may install on a different one, so showing both keeps the
 * decision in their hands.
 */
import { Copy, Terminal } from "lucide-react";
import { toast } from "sonner";

const PS_CMD = "irm https://vibefence-black.vercel.app/install.ps1 | iex";
const SH_CMD = "curl -fsSL https://vibefence-black.vercel.app/install.sh | sh";
const PS_BYPASS_CMD =
  'powershell -ExecutionPolicy Bypass -Command "irm https://vibefence-black.vercel.app/install.ps1 | iex"';

function CodeBlock({ command, label }: { command: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono uppercase text-[10px] text-foreground/50 tracking-widest">
        {label}
      </p>
      <div className="bg-background border border-border p-3 font-mono text-xs text-foreground/80 flex items-start gap-2 break-all">
        <span className="text-primary shrink-0 select-none">$</span>
        <code className="flex-1 break-all">{command}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(command);
            toast.success("Copied");
          }}
          className="shrink-0 text-foreground/50 hover:text-primary transition-colors"
          aria-label="Copy command"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function InstallHint() {
  return (
    <div className="border border-primary/20 bg-background/40 backdrop-blur-sm p-6 space-y-4">
      <div className="space-y-1.5">
        <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest flex items-center gap-1.5">
          <Terminal className="w-3 h-3" />
          // Already signed up? Install the agent first
        </p>
        <h2 className="font-sentient text-base text-foreground/90">
          Install Vibefence on your machine
        </h2>
        <p className="font-mono text-[11px] text-foreground/50">
          Requires Python 3.11+. Installs to <code className="text-foreground/70">~/.vibefence/agent</code>. Idempotent &mdash; safe to re-run.
        </p>
      </div>

      <div className="space-y-3">
        <CodeBlock command={PS_CMD} label="Windows / PowerShell" />
        <CodeBlock command={SH_CMD} label="macOS / Linux" />
      </div>

      <details className="border border-border/40 bg-background/30 px-3 py-2">
        <summary className="font-mono uppercase text-[10px] text-foreground/50 tracking-widest cursor-pointer">
          Windows blocked the .ps1?
        </summary>
        <div className="pt-2 space-y-2">
          <p className="font-mono text-[11px] text-foreground/50">
            Use the in-memory bypass form:
          </p>
          <div className="bg-background border border-border p-2 font-mono text-[11px] text-foreground/80 flex items-start gap-2 break-all">
            <code className="flex-1 break-all">{PS_BYPASS_CMD}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(PS_BYPASS_CMD);
                toast.success("Copied");
              }}
              className="shrink-0 text-foreground/50 hover:text-primary transition-colors"
              aria-label="Copy bypass command"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
      </details>

      <p className="font-mono text-[11px] text-foreground/50 pt-1 border-t border-border/40">
        After install, return here, sign in, generate a pairing code, and run{" "}
        <code className="text-foreground/80">vibefence pair &lt;CODE&gt;</code>.
      </p>
    </div>
  );
}
