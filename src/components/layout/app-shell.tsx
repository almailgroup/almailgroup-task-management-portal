"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
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

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer, matching the dialog behaviour elsewhere.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-svh bg-background">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-background lg:block">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
              A
            </div>
            <span className="text-sm font-medium tracking-tight">
              Almailgroup
            </span>
          </Link>
        </div>
        <div className="h-[calc(100svh-3.5rem)]">
          <SidebarNav
            profile={profile}
            projects={projects}
            activeProjectId={activeProjectId}
          />
        </div>
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
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
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
              <SidebarNav
                profile={profile}
                projects={projects}
                activeProjectId={activeProjectId}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>

          <div className="flex flex-1 items-center justify-end gap-1">
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
    </div>
  );
}
