import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  pillar?: 1 | 2 | 3;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

const PILLAR_LABEL: Record<NonNullable<Props["pillar"]>, string> = {
  1: "Pillar I — Live coding railguards",
  2: "Pillar II — Agentic red-team",
  3: "Pillar III — Reversible snapshots",
};

export function SectionCard({
  title,
  subtitle,
  pillar,
  action,
  children,
  className,
  id,
}: Props) {
  return (
    <section
      id={id}
      className={cn(
        "border border-border bg-background/40 backdrop-blur-sm",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
        <div>
          {pillar && (
            <p className="font-mono uppercase text-[10px] text-primary/70 tracking-widest mb-1">
              {PILLAR_LABEL[pillar]}
            </p>
          )}
          <h2 className="font-sentient text-xl text-foreground">{title}</h2>
          {subtitle && (
            <p className="font-mono text-xs text-foreground/50 mt-1">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
