"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  ListFilter,
  Menu,
  Sunrise,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Thumb-reachable navigation for phones and small tablets.
 *
 * Every destination used to be two taps away behind a hamburger at the top
 * left of the screen — the hardest corner to reach one-handed. The four places
 * people actually live in are now one tap, and everything else (projects, the
 * team, the assistant) is behind "More", which opens the same drawer.
 *
 * Above `lg` the sidebar rail is always on screen, so this is hidden there.
 */
const ITEMS = [
  { href: "/today", label: "Today", icon: Sunrise },
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/tasks?filter=all", match: "/tasks", label: "Tasks", icon: ListFilter },
  { href: "/my-list", label: "My List", icon: ListChecks },
] as const;

export function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-chrome-border bg-chrome/90 backdrop-blur-md lg:hidden",
        // Sits above the home indicator on a phone rather than under it.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {ITEMS.map((item) => {
          const active = pathname === ("match" in item ? item.match : item.href);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn("size-5", active && "stroke-[2.25]")}
                  aria-hidden
                />
                <span className="truncate">{item.label}</span>
                {/* A dot rather than a fill: the bar should read as a set of
                    labels, not as four buttons competing with the page. */}
                <span
                  className={cn(
                    "h-0.5 w-5 rounded-full transition-colors",
                    active ? "bg-foreground" : "bg-transparent",
                  )}
                />
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMore}
            aria-label="More — projects, team and settings"
            className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="size-5" aria-hidden />
            <span>More</span>
            <span className="h-0.5 w-5" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
