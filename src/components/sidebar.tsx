"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Database, GitCompare, History, Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/connections", label: "Connections", icon: Database },
  { href: "/comparisons", label: "Comparisons", icon: GitCompare },
  { href: "/history", label: "Drift History", icon: History, soon: true },
  { href: "/settings/monitoring", label: "Alerts", icon: Bell, soon: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  // Most specific match wins so /settings/monitoring doesn't also light up /settings
  const active = NAV.filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface/40 px-3 py-4">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-xs font-bold text-bg">D</span>
        <span className="font-semibold tracking-tight">Driftly</span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, soon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text",
              active === href && "bg-surface-2 text-text",
            )}
          >
            <Icon size={16} aria-hidden />
            <span className="flex-1">{label}</span>
            {soon && <span className="text-[10px] uppercase tracking-wide text-muted/70">Soon</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
