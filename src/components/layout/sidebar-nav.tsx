"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Hash,
  LayoutDashboard,
  ListChecks,
  Plus,
  Sparkles,
  Sunrise,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { SidebarClock } from "@/components/layout/sidebar-clock";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { cn } from "@/lib/utils";
import type { Profile, Project } from "@/lib/supabase/database.types";

/**
 * Sidebar contents, shared by the fixed desktop rail and the mobile drawer.
 */
export function SidebarNav({
  profile,
  projects,
  activeProjectId,
  onNavigate,
  onOpenMaham,
}: {
  profile: Profile;
  projects: Project[];
  activeProjectId?: string;
  onNavigate?: () => void;
  /** Hands the rail over to MAHAM AI; owned by AppShell, which resizes it. */
  onOpenMaham: () => void;
}) {
  const pathname = usePathname();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const canCreateProject = profile.role === "admin" || profile.role === "manager";

  // Derived from the route so the layout does not have to thread it down.
  const currentProjectId =
    activeProjectId ?? pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const activeProject =
    projects.find((project) => project.id === currentProjectId) ?? null;

  return (
    <>
      <div className="flex h-full flex-col gap-4 p-3">
        <ProjectSwitcher
          projects={projects}
          activeProject={activeProject}
          canCreate={canCreateProject}
          onCreate={() => setDialogOpen(true)}
        />

        <nav className="flex flex-col gap-0.5" aria-label="Main">
          <NavLink
            href="/dashboard"
            icon={<LayoutDashboard />}
            label="Dashboard"
            active={pathname === "/dashboard"}
            onNavigate={onNavigate}
          />
          <NavLink
            href="/today"
            icon={<Sunrise />}
            label="Today"
            active={pathname === "/today"}
            onNavigate={onNavigate}
          />
          <NavLink
            href="/calendar"
            icon={<CalendarDays />}
            label="Calendar"
            active={pathname === "/calendar"}
            onNavigate={onNavigate}
          />
          <NavLink
            href="/my-list"
            icon={<ListChecks />}
            label="My List"
            active={pathname === "/my-list"}
            onNavigate={onNavigate}
          />
          <NavLink
            href="/general"
            icon={<ClipboardList />}
            label="General tasks"
            active={pathname === "/general"}
            onNavigate={onNavigate}
          />
          <NavLink
            href="/team"
            icon={<Users />}
            label="Team"
            active={pathname === "/team"}
            onNavigate={onNavigate}
          />
        </nav>

        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">
              Projects
            </span>
            {canCreateProject && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDialogOpen(true)}
                aria-label="New project"
              >
                <Plus />
              </Button>
            )}
          </div>

          <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="px-2 py-1.5 text-sm leading-relaxed text-muted-foreground">
                {canCreateProject
                  ? "Create your first project to get started."
                  : "No projects yet."}
              </p>
            ) : (
              projects.map((project) => (
                <NavLink
                  key={project.id}
                  href={`/projects/${project.id}`}
                  icon={<Hash />}
                  label={project.name}
                  active={project.id === currentProjectId}
                  onNavigate={onNavigate}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-1.5">
          <button
            type="button"
            onClick={onOpenMaham}
            data-maham-launcher
            className={cn(
              "group/maham lift flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2.5 text-left shadow-[var(--shadow-xs)]",
              "hover:border-foreground/25 hover:bg-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
            >
              <Sparkles className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight">
                MAHAM AI
              </span>
              <span className="block truncate text-xs leading-tight text-muted-foreground">
                Ask about your tasks
              </span>
            </span>
          </button>

          <SidebarClock />
        </div>
      </div>

      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-150",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        active
          // Inverted fill: the current page should be unmistakable at a glance,
          // which a hairline marker on the leading edge never was.
          ? "bg-primary font-semibold text-primary-foreground shadow-[var(--shadow-sm)] [&_svg]:text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:text-muted-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
