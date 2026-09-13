"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * Keeps a project's task list live.
 *
 * Inserts and status/priority edits are applied straight to local state so the
 * board reacts immediately. Anything that changes the assignee set is handled
 * by asking the server to re-render instead, because a Realtime payload for
 * `task_assignments` carries only ids — resolving them to profiles here would
 * mean a second round trip per event.
 *
 * `router.refresh()` calls are debounced so a burst of changes (someone
 * reordering a column, a bulk edit) collapses into one refetch.
 */
export function useProjectTaskStream(
  projectId: string,
  initial: TaskWithAssignees[],
): TaskWithAssignees[] {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [tasks, setTasks] = React.useState(initial);
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt each new server render.
  React.useEffect(() => setTasks(initial), [initial]);

  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  }, [router]);

  React.useEffect(() => {
    const channel = supabase
      .channel(`project-tasks:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as TaskWithAssignees;
          setTasks((current) => {
            const index = current.findIndex((task) => task.id === row.id);
            if (index === -1) return current;
            const next = [...current];
            // Preserve the joined assignees; the payload does not include them.
            next[index] = { ...row, assignees: current[index].assignees };
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const removed = payload.old as { id?: string };
          if (!removed.id) return;
          setTasks((current) => current.filter((task) => task.id !== removed.id));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        // A new task needs its assignees resolved, so refetch.
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        // task_assignments has no project_id to filter on, so this fires for
        // every assignment change; the debounce keeps that cheap.
        { event: "*", schema: "public", table: "task_assignments" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, projectId, scheduleRefresh]);

  return tasks;
}
