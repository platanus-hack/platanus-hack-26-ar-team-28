import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-border/60 px-6 py-12 flex flex-col items-center text-center">
      <Icon className="w-8 h-8 text-foreground/30 mb-4" />
      <p className="font-sentient text-lg text-foreground/80">{title}</p>
      <p className="font-mono text-xs text-foreground/40 mt-2 max-w-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
