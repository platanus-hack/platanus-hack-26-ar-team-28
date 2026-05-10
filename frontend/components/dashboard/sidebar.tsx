"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Crosshair,
  FolderTree,
  Gauge,
  Radio,
  Server,
  Settings,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { logout } from "@/app/(auth)/actions";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Command Center", icon: Gauge },
  { href: "/sentinel", label: "Sentinel", icon: Radio },
  { href: "/red-team", label: "Red Teaming", icon: Crosshair },
  { href: "/projects", label: "Projects", icon: FolderTree },
  { href: "/runners", label: "Runners", icon: Server },
];

export function DashboardSidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-border bg-background/60 backdrop-blur-sm">
      <div className="p-6 border-b border-border">
        <Link href="/dashboard">
          <Logo className="w-[100px]" />
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        <div>
          <p className="font-mono uppercase text-[10px] text-foreground/40 tracking-wider px-3 mb-2">
            Workspace
          </p>
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors border border-transparent",
                      active
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "text-foreground/60 hover:text-foreground hover:bg-foreground/5",
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="p-4 border-t border-border space-y-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 font-mono text-xs uppercase tracking-wider text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
        {userEmail && (
          <div className="px-3 py-2 border border-border bg-background/60">
            <p className="font-mono text-[10px] text-foreground/40 uppercase tracking-wider">
              Signed in
            </p>
            <p className="font-mono text-xs text-foreground/80 truncate">{userEmail}</p>
          </div>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-left px-3 py-2 font-mono text-xs uppercase tracking-wider text-foreground/60 hover:text-primary hover:bg-foreground/5 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
