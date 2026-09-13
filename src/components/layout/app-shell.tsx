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
import {
  SIDEBAR_CHAT_DEFAULT,
  SIDEBAR_DEFAULT,
  SIDEBAR_STORAGE_KEY,
  clampSidebarWidth,
} from "@/lib/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import type { MahamMessage } from "@/lib/maham/types";
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

  // Server-rendered at the default; the inline script in the layout has
  // already painted the stored width, so adopting it here only syncs React's
  // copy rather than causing a visible jump.
  const [sidebarWidth, setSidebarWidth] = React.useState(SIDEBAR_DEFAULT);

  // MAHAM AI takes over the rail rather than opening over the board, so you
  // can read a task while asking about it. The thread lives here so the rail
  // and the mobile drawer share one conversation, and closing the panel does
  // not throw it away.
  const [mahamOpen, setMahamOpen] = React.useState(false);
  // The drawer is an overlay, not a resizable rail, so it tracks its own view.
  const [drawerMaham, setDrawerMaham] = React.useState(false);
  const [mahamMessages, setMahamMessages] = React.useState<MahamMessage[]>([]);
  const navWidth = React.useRef(SIDEBAR_DEFAULT);

  // Width changes are animated only while opening or closing the assistant —
  // a transition during a resize drag would lag a frame behind the pointer.
  const [animating, setAnimating] = React.useState(false);

  const openMaham = React.useCallback(() => {
    navWidth.current = sidebarWidth;
    setSidebarWidth(
      clampSidebarWidth(Math.max(sidebarWidth, SIDEBAR_CHAT_DEFAULT), "chat"),
    );
    setMahamOpen(true);
    setDrawerOpen(false);
    setAnimating(true);
  }, [sidebarWidth]);

  const closeMaham = React.useCallback(() => {
    setSidebarWidth(clampSidebarWidth(navWidth.current));
    setMahamOpen(false);
    setAnimating(true);
  }, []);

  React.useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => setAnimating(false), 240);
    return () => clearTimeout(timer);
  }, [animating, sidebarWidth]);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored) {
        const width = clampSidebarWidth(Number(stored));
        navWidth.current = width;
        setSidebarWidth(width);
      }
    } catch {
      // Private browsing or blocked storage: the default is fine.
    }
  }, []);

  // Drive both the rail and the content offset from one custom property, so
  // they cannot drift apart.
  React.useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${sidebarWidth}px`,
    );
  }, [sidebarWidth]);

  const persistWidth = React.useCallback(
    (value: number) => {
      // While the assistant holds the rail the width is its own, not the
      // navigation width to come back to — remember it separately.
      if (mahamOpen) {
        navWidth.current = clampSidebarWidth(navWidth.current);
        return;
      }
      navWidth.current = value;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
      } catch {
        // Not being able to remember the width is not worth surfacing.
      }
    },
    [mahamOpen],
  );

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => {
    setDrawerOpen(false);
    setDrawerMaham(false);
  }, [pathname]);

  // Escape closes the drawer, and hands the rail back from the assistant —
  // matching the dialog behaviour elsewhere.
  React.useEffect(() => {
    if (!drawerOpen && !mahamOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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
            <MahamPanel
              messages={mahamMessages}
              onMessages={setMahamMessages}
              onClose={closeMaham}
            />
          </div>
        </div>

        <SidebarResizer
          width={sidebarWidth}
          mode={mahamOpen ? "chat" : "nav"}
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
              drawerMaham ? "w-[22rem]" : "w-72",
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
              <div className={cn("h-full", drawerMaham && "hidden")}>
                <SidebarNav
                  profile={profile}
                  projects={projects}
                  activeProjectId={activeProjectId}
                  onNavigate={() => setDrawerOpen(false)}
                  onOpenMaham={() => setDrawerMaham(true)}
                />
              </div>
              <div className={cn("h-full", !drawerMaham && "hidden")}>
                <MahamPanel
                  messages={mahamMessages}
                  onMessages={setMahamMessages}
                  onClose={() => setDrawerMaham(false)}
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
