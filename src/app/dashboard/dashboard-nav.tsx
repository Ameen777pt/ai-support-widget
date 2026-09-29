"use client";

import Link from "next/link";

export type DashboardView = "overview" | "inbox" | "knowledge" | "gaps" | "widget";

interface DashboardNavProps {
  activeView: DashboardView;
  escalatedCount?: number;
  openGapsCount?: number;
}

export function DashboardNav({
  activeView,
  escalatedCount = 0,
  openGapsCount = 0,
}: DashboardNavProps) {
  const navItems = [
    {
      id: "overview" as DashboardView,
      label: "Overview",
      href: "/dashboard?view=overview",
      badge: null,
      badgeVariant: "zinc" as const,
    },
    {
      id: "inbox" as DashboardView,
      label: "Inbox",
      href: "/dashboard?view=inbox",
      badge: escalatedCount > 0 ? `${escalatedCount} escalated` : null,
      badgeVariant: "rose" as const,
    },
    {
      id: "knowledge" as DashboardView,
      label: "Knowledge",
      href: "/dashboard?view=knowledge",
      badge: null,
      badgeVariant: "zinc" as const,
    },
    {
      id: "gaps" as DashboardView,
      label: "Knowledge Gaps",
      href: "/dashboard?view=gaps",
      badge: openGapsCount > 0 ? `${openGapsCount} open` : null,
      badgeVariant: "amber" as const,
    },
    {
      id: "widget" as DashboardView,
      label: "Widget",
      href: "/dashboard?view=widget",
      badge: null,
      badgeVariant: "zinc" as const,
    },
  ];

  return (
    <nav
      aria-label="Dashboard navigation"
      className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 scrollbar-none"
    >
      {navItems.map((item) => {
        const isActive = activeView === item.id;

        return (
          <Link
            key={item.id}
            href={item.href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all min-h-[40px] ${
              isActive
                ? "bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            }`}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  isActive
                    ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                    : item.badgeVariant === "rose"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                }`}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
