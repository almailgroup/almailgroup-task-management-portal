"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Columns3,
  Hash,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { ProjectMembers } from "@/components/projects/project-members";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskTable } from "@/components/tasks/task-table";
import { useTaskStream } from "@/lib/realtime/use-task-stream";
import { deleteProject } from "@/lib/data/project-actions";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import type {
  Profile,
  Project,
  TaskPriority,
  TaskStatus,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

type View = "board" | "list";

/**
 * Project workspace: view switcher, filters, and the Kanban/list views.
 *
 * Filtering is client-side. The project task set is small enough that round
 * tripping every keystroke would be slower and less pleasant than filtering
 * the list already in memory.
 */
export function ProjectWorkspace({
  project,
  tasks,
  team,
  members,
  profile,
}: {
  project: Project;
  tasks: TaskWithAssignees[];
  team: Profile[];
  members: Profile[];
  profile: Profile;
}) {
  const router = useRouter();

  // Keeps the board in sync when teammates change tasks elsewhere.
  const liveTasks = useTaskStream({ projectId: project.id, initial: tasks });

  const [view, setView] = React.useState<View>("board");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<TaskStatus | "all">("all");
  const [priority, setPriority] = React.useState<TaskPriority | "all">("all");
  const [assignee, setAssignee] = React.useState<string>("all");

  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false);
  const [activeTask, setActiveTask] = React.useState<TaskWithAssignees | null>(
    null,
  );
  const [newTaskStatus, setNewTaskStatus] = React.useState<TaskStatus>("todo");
  const [projectDialogOpen, setProjectDialogOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const canManageProject =
    profile.role === "admin" ||
    (profile.role === "manager" && project.created_by === profile.id);
  const canComplete = profile.role === "admin" || profile.role === "manager";
  // Members no longer create or delete tasks; they work the ones assigned to
  // them. Hiding the control states that instead of letting the save fail.
  const canCreate = canComplete;

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();

    return liveTasks.filter((task) => {
      if (status !== "all" && task.status !== status) return false;
      if (priority !== "all" && task.priority !== priority) return false;

      if (assignee === "unassigned") {
        if (task.assignees.length > 0) return false;
      } else if (assignee !== "all") {
        if (!task.assignees.some((person) => person.id === assignee)) return false;
      }

      if (needle) {
        const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [liveTasks, query, status, priority, assignee]);

  const filtersActive =
    query.trim() !== "" ||
    status !== "all" ||
    priority !== "all" ||
    assignee !== "all";

  function openTask(task: TaskWithAssignees) {
    setActiveTask(task);
    setTaskDialogOpen(true);
  }

  function createTask(columnStatus: TaskStatus) {
    setActiveTask(null);
    setNewTaskStatus(columnStatus);
    setTaskDialogOpen(true);
  }

  async function onDeleteProject() {
    const outcome = await deleteProject(project.id);
    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    toast.success("Project deleted");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <PageShell>
      <PageHeader
        title={project.name}
        icon={<Hash />}
        description={project.description ?? undefined}
        actions={
          <>
            <ProjectMembers
            projectId={project.id}
            members={members}
            team={team}
              canManage={profile.role === "admin" || profile.role === "manager"}
            />
            {canCreate && (
              <Button size="sm" onClick={() => createTask("todo")}>
                <Plus />
                New task
              </Button>
            )}

            {canManageProject && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Project actions"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setProjectDialogOpen(true)}>
                    <Pencil />
                    Edit project
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
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
            aria-label="Search tasks"
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

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setPriority("all");
              setAssignee("all");
            }}
          >
            Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {liveTasks.length}
        </span>
      </div>

      {view === "board" ? (
        <KanbanBoard
          tasks={filtered}
          projectId={project.id}
          canComplete={canComplete}
          canCreate={canCreate}
          onOpenTask={openTask}
          onCreateTask={createTask}
        />
      ) : (
        <TaskTable tasks={filtered} onOpenTask={openTask} />
      )}

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={activeTask}
        projectId={project.id}
        team={team}
        currentProfile={profile}
        defaultStatus={newTaskStatus}
      />

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={project}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this project?"
        description={
          <>
            <span className="font-medium text-foreground">{project.name}</span>{" "}
            and all {liveTasks.length}{" "}
            {liveTasks.length === 1 ? "task" : "tasks"} in it will be
            permanently deleted, along with their comments, attachments and
            history. This cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        onConfirm={async () => {
          await onDeleteProject();
          setConfirmDelete(false);
        }}
      />
    </PageShell>
  );
}
