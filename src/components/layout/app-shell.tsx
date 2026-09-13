"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  CommandHint,
  CommandPalette,
} from "@/components/layout/command-palette";
import { SidebarResizer } from "@/components/layout/sidebar-resizer";
import { MahamPanel } from "@/components/maham/maham-panel";
import { useMaham } from "@/components/maham/use-maham";
import {
  SIDEBAR_CHAT_DEFAULT,
  SIDEBAR_DEFAULT,
  SIDEBAR_STORAGE_KEY,
  clampSidebarWidth,
  sidebarBounds,
} from "@/lib/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import type {
  Notification,
  Profile,
  Project,
} from "@/lib/supabase/database.types";

/**
 * Authenticated chrome: a fixed sidebar on desktop, an overlay drawer below
 * `lg`, and a slim sticky header. Kept compact — 56px header, 15rem rail — so
 * the task views get as much of the viewport as possible.
 */
export function AppShell({
  profile,
  projects,
  notifications,
  unreadCount,
  activeProjectId,
  children,
}: {
  profile: Profile;
  projects: Project[];
  notifications: Notification[];
  unreadCount: number;
  activeProjectId?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Two independent widths, picked by what the rail is currently showing.
  // Modelling it as one width plus a saved copy meant a commit had to guess
  // which one it belonged to, and the width the assistant was dragged to was
  // thrown away on every close.
  //
  // Both are server-rendered at their defaults; the inline script in the
  // layout has already painted the stored navigation width, so adopting it
  // below syncs React's copy rather than causing a visible jump.
  const [navWidth, setNavWidth] = React.useState(SIDEBAR_DEFAULT);
  const [chatWidth, setChatWidth] = React.useState(SIDEBAR_CHAT_DEFAULT);
  const [adopted, setAdopted] = React.useState(false);

  // MAHAM AI takes over the rail rather than opening over the board, so you
  // can read a task while asking about it. One flag drives both the rail and
  // the drawer: a second flag for the drawer drifted out of sync with this one
  // and left the hamburger reopening into the assistant.
  const [mahamOpen, setMahamOpen] = React.useState(false);
  const maham = useMaham();

  // Width changes are animated only while opening or closing the assistant —
  // a transition left on during a resize drag trails the pointer by a frame.
  const [animating, setAnimating] = React.useState(false);

  const [viewportWidth, setViewportWidth] = React.useState(0);
  React.useEffect(() => {
    const measure = () => setViewportWidth(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /**
   * What the resizer may do right now. The assistant gets a wider ceiling than
   * navigation, but never more than a certain share of the window: at the `lg`
   * breakpoint the flat 640px maximum left the board narrower than the mobile
   * drawer.
   */
  const bounds = React.useMemo(() => {
    const base = sidebarBounds(mahamOpen ? "chat" : "nav");
    if (!mahamOpen || viewportWidth === 0) return base;
    const max = Math.max(
      base.min,
      Math.min(base.max, Math.round(viewportWidth * 0.45)),
    );
    return { min: base.min, max, preferred: Math.min(base.preferred, max) };
  }, [mahamOpen, viewportWidth]);

  const sidebarWidth = mahamOpen
    ? Math.min(chatWidth, bounds.max)
    : navWidth;

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored) setNavWidth(clampSidebarWidth(Number(stored)));
    } catch {
      // Private browsing or blocked storage: the default is fine.
    }
    setAdopted(true);
  }, []);

  // Drive both the rail and the content offset from one custom property, so
  // they cannot drift apart. Held back until the stored width has been
  // adopted: writing the default here first would paint over the value the
  // layout's inline script exists to set.
  React.useEffect(() => {
    if (!adopted) return;
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${sidebarWidth}px`,
    );
  }, [adopted, sidebarWidth]);

  const setSidebarWidth = React.useCallback(
    (value: number) => {
      if (mahamOpen) setChatWidth(clampSidebarWidth(value, "chat"));
      else setNavWidth(clampSidebarWidth(value));
    },
    [mahamOpen],
  );

  const persistWidth = React.useCallback(
    (value: number) => {
      // Only navigation widths are remembered. Clamped on the way in: a drag
      // that starts in chat mode and ends after the mode flipped would
      // otherwise store a width navigation can never use.
      if (mahamOpen) {
        setChatWidth(clampSidebarWidth(value, "chat"));
        return;
      }
      const width = clampSidebarWidth(value);
      setNavWidth(width);
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
      } catch {
        // Not being able to remember the width is not worth surfacing.
      }
    },
    [mahamOpen],
  );

  const openMaham = React.useCallback(() => {
    setMahamOpen(true);
    setAnimating(true);
  }, []);

  const closeMaham = React.useCallback(() => {
    setMahamOpen(false);
    setAnimating(true);
    // Hand focus back to the launcher; it is about to be shown again, and the
    // element that had focus is about to be display:none.
    requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLButtonElement>("[data-maham-launcher]")
        .forEach((button) => {
          if (button.offsetParent !== null) button.focus();
        });
    });
  }, []);

  // Deliberately not keyed on the width: a resize drag changes it every few
  // milliseconds, which would re-arm this timer for the whole drag and leave
  // the transition applied — the exact thing it is meant to avoid.
  React.useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => setAnimating(false), 240);
    return () => clearTimeout(timer);
  }, [animating]);

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer, and hands the rail back from the assistant —
  // matching the dialog behaviour elsewhere.
  React.useEffect(() => {
    if (!drawerOpen && !mahamOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A Radix layer that handled this keystroke marks it handled. Without
      // this check, dismissing the command palette or any dialog also
      // collapsed the assistant out of the rail behind it.
      if (event.defaultPrevented) return;
      if (drawerOpen) setDrawerOpen(false);
      else closeMaham();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, mahamOpen, closeMaham]);

  return (
    <div className="min-h-svh bg-background">
      {/* Desktop rail */}
      <aside
        style={{ width: "var(--sidebar-width)" }}
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-chrome-border bg-chrome lg:block",
          animating && "transition-[width] duration-200 ease-out",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-chrome-border px-4">
          <Link
            href="/today"
            className="group flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              A
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">
                Almailgroup
              </span>
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                Task Portal
              </span>
            </span>
          </Link>
        </div>
        <div className="h-[calc(100svh-3.5rem)]">
          {/* Both are mounted and one is hidden: the navigation keeps its
              scroll position, and the conversation survives a close. */}
          <div className={cn("h-full", mahamOpen && "hidden")}>
            <SidebarNav
              profile={profile}
              projects={projects}
              activeProjectId={activeProjectId}
              onOpenMaham={openMaham}
            />
          </div>
          <div className={cn("h-full", !mahamOpen && "hidden")}>
            <MahamPanel maham={maham} active={mahamOpen} onClose={closeMaham} />
          </div>
        </div>

        <SidebarResizer
          width={sidebarWidth}
          bounds={bounds}
          onChange={setSidebarWidth}
          onCommit={persistWidth}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex max-w-[92vw] flex-col border-r border-chrome-border bg-chrome",
              "transition-[width] duration-200 ease-out",
              mahamOpen ? "w-[22rem]" : "w-72",
            )}
          >
            <div className="flex h-14 items-center justify-between border-b border-chrome-border px-4">
              <span className="text-sm font-medium tracking-tight">
                Almailgroup
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
              >
                <X />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <div className={cn("h-full", mahamOpen && "hidden")}>
                <SidebarNav
                  profile={profile}
                  projects={projects}
                  activeProjectId={activeProjectId}
                  onNavigate={() => setDrawerOpen(false)}
                  onOpenMaham={openMaham}
                />
              </div>
              <div className={cn("h-full", !mahamOpen && "hidden")}>
                <MahamPanel
                  maham={maham}
                  active={mahamOpen}
                  onClose={closeMaham}
                />
              </div>
            </div>
          </aside>
        </div>
      )}

      <div
        className={cn(
          "lg:pl-[var(--sidebar-width)]",
          animating && "transition-[padding] duration-200 ease-out",
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-chrome-border bg-chrome/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-chrome/65 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            <CommandHint />
          </div>

          <div className="flex items-center gap-1">
            <NotificationBell
              profile={profile}
              initialItems={notifications}
              initialUnread={unreadCount}
            />
            <ThemeToggle />
            <UserMenu profile={profile} />
          </div>
        </header>

        <main className="min-h-[calc(100svh-3.5rem)]">{children}</main>
      </div>

      <CommandPalette projects={projects} />
    </div>
  );
}
