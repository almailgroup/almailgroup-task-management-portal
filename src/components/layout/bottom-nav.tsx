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
import { useI18n } from "@/lib/i18n/client";

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
  { href: "/today", label: "nav.today", icon: Sunrise },
  { href: "/dashboard", label: "nav.home", icon: LayoutDashboard },
  { href: "/tasks?filter=all", match: "/tasks", label: "nav.tasks", icon: ListFilter },
  { href: "/my-list", label: "nav.myList", icon: ListChecks },
] as const;

export function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.tasks")}
      className={cn(
        "glass-chrome fixed inset-x-0 bottom-0 z-30 border-0 border-t lg:hidden",
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
                // Four links, always on screen: fetch the pages, not just
                // their skeletons. See the note on the sidebar's NavLink.
                prefetch
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
                <span className="truncate">{t(item.label)}</span>
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
            aria-label={t("shell.moreLabel")}
            className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="size-5" aria-hidden />
            <span>{t("shell.more")}</span>
            <span className="h-0.5 w-5" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
