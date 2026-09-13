"use client";

import * as React from "react";
import { Columns3, List, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskTable } from "@/components/tasks/task-table";
import { useTaskStream } from "@/lib/realtime/use-task-stream";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import type {
  Profile,
  TaskPriority,
  TaskStatus,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

/**
 * General tasks: work assigned to people that belongs to no project.
 *
 * Only managers and admins can create one — enforced by RLS, mirrored here by
 * hiding the button rather than letting the save fail.
 */
export function GeneralTasks({
  tasks,
  team,
  profile,
}: {
  tasks: TaskWithAssignees[];
  team: Profile[];
  profile: Profile;
}) {
  const liveTasks = useTaskStream({ projectId: null, initial: tasks });

  const [view, setView] = React.useState<"board" | "list">("board");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<TaskStatus | "all">("all");
  const [priority, setPriority] = React.useState<TaskPriority | "all">("all");
  const [assignee, setAssignee] = React.useState("all");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [activeTask, setActiveTask] = React.useState<TaskWithAssignees | null>(
    null,
  );
  const [newStatus, setNewStatus] = React.useState<TaskStatus>("todo");

  const canManage = profile.role === "admin" || profile.role === "manager";

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();

    return liveTasks.filter((task) => {
      if (status !== "all" && task.status !== status) return false;
      if (priority !== "all" && task.priority !== priority) return false;

      if (assignee === "unassigned") {
        if (task.assignees.length > 0) return false;
      } else if (assignee !== "all") {
        if (!task.assignees.some((p) => p.id === assignee)) return false;
      }

      if (needle) {
        const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [liveTasks, query, status, priority, assignee]);

  function openTask(task: TaskWithAssignees) {
    setActiveTask(task);
    setDialogOpen(true);
  }

  function createTask(columnStatus: TaskStatus) {
    setActiveTask(null);
    setNewStatus(columnStatus);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>General tasks</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {canManage
              ? "Work that belongs to no project. Assign it to anyone on the team."
              : "Work assigned to you outside of any project."}
          </p>
        </div>

        {canManage && (
          <Button size="sm" onClick={() => createTask("todo")}>
            <Plus />
            New general task
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as "board" | "list")}
        >
          <TabsList>
            <TabsTrigger value="board">
              <Columns3 />
              Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <List />
              List
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            className="h-9 pl-8"
            aria-label="Search general tasks"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as TaskStatus | "all")}
        >
          <SelectTrigger size="sm" className="w-[8.5rem]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={priority}
          onValueChange={(value) => setPriority(value as TaskPriority | "all")}
        >
          <SelectTrigger size="sm" className="w-[8.5rem]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TASK_PRIORITIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger size="sm" className="w-[9.5rem]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {team.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.full_name ?? person.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {liveTasks.length}
        </span>
      </div>

      {view === "board" ? (
        <KanbanBoard
          tasks={filtered}
          projectId={null}
          canComplete={canManage}
          onOpenTask={openTask}
          onCreateTask={createTask}
        />
      ) : (
        <TaskTable tasks={filtered} onOpenTask={openTask} />
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={activeTask}
        projectId={null}
        team={team}
        currentProfile={profile}
        defaultStatus={newStatus}
      />
    </div>
  );
}
