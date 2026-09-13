"use client";

import * as React from "react";
import {
  ClipboardList,
  Columns3,
  List,
  PhoneCall,
  Plus,
  Search,
} from "lucide-react";

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
import { FollowUpList } from "@/components/tasks/follow-up-list";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
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
  followUps,
  team,
  profile,
}: {
  tasks: TaskWithAssignees[];
  followUps: TaskWithAssignees[];
  team: Profile[];
  profile: Profile;
}) {
  const liveTasks = useTaskStream({ projectId: null, initial: tasks });

  const [view, setView] = React.useState<"board" | "list" | "followups">(
    "board",
  );
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
    <PageShell>
      <PageHeader
        title="General tasks"
        icon={<ClipboardList />}
        description={
          canManage
            ? "Work that belongs to no project. Assign it to anyone on the team."
            : "Work assigned to you outside of any project."
        }
        actions={
          canManage ? (
            <Button size="sm" onClick={() => createTask("todo")}>
              <Plus />
              New general task
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(value) =>
            setView(value as "board" | "list" | "followups")
          }
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
            <TabsTrigger value="followups">
              <PhoneCall />
              Follow-ups
              {followUps.length > 0 && (
                <span className="ml-0.5 tabular-nums opacity-70">
                  {followUps.length}
                </span>
              )}
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

      {view === "followups" ? (
        <FollowUpList
          tasks={followUps}
          canManage={canManage}
          onOpenTask={openTask}
        />
      ) : view === "board" ? (
        <KanbanBoard
          tasks={filtered}
          projectId={null}
          canComplete={canManage}
          canCreate={canManage}
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
    </PageShell>
  );
}
