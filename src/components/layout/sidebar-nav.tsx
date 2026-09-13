"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hash, LayoutDashboard, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
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
}: {
  profile: Profile;
  projects: Project[];
  activeProjectId?: string;
  onNavigate?: () => void;
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
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        active
          ? "bg-accent font-medium text-accent-foreground [&_svg]:text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
