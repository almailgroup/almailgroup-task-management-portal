"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, FormError } from "@/components/auth/field-error";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { toDateTimeLocal } from "@/components/tasks/task-meta";
import { AttachmentPanel } from "@/components/tasks/attachment-panel";
import { TaskDetailReadonly } from "@/components/tasks/task-detail-readonly";
import { CommentThread } from "@/components/tasks/comment-thread";
import { TaskActivityFeed } from "@/components/tasks/task-activity-feed";
import { createTask, deleteTask, updateTask } from "@/lib/data/task-actions";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import type { ActionResult } from "@/lib/action-result";
import type {
  Profile,
  TaskStatus,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

/**
 * Task detail modal. Doubles as the create form when `task` is null.
 *
 * Comments and activity are loaded and streamed client-side (see
 * CommentThread), so the thread stays live while the modal is open.
 */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  projectId,
  team,
  currentProfile,
  defaultStatus = "todo",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskWithAssignees | null;
  projectId: string | null;
  team: Profile[];
  currentProfile: Profile;
  defaultStatus?: TaskStatus;
}) {
  const router = useRouter();
  const editing = Boolean(task);
  const canComplete =
    currentProfile.role === "admin" || currentProfile.role === "manager";
  // Title, description, priority, due date and assignees belong to whoever
  // plans the work. Members see them, they do not set them.
  const canEditDetails = canComplete;

  const [pending, setPending] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<{
    id: string;
  }> | null>(null);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([]);

  // Re-seed local state each time the dialog opens or switches task.
  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    setAssigneeIds(task?.assignees.map((person) => person.id) ?? []);
  }, [open, task]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const outcome = task
      ? await updateTask(task.id, projectId, null, formData)
      : await createTask(projectId, null, formData);

    setPending(false);

    if (!outcome.ok) {
      setResult(outcome);
      return;
    }

    toast.success(editing ? "Task updated" : "Task created");
    onOpenChange(false);
    router.refresh();
  }

  async function onDelete() {
    if (!task) return;
    setDeleting(true);
    const outcome = await deleteTask(task.id, projectId);
    setDeleting(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }

    toast.success("Task deleted");
    onOpenChange(false);
    router.refresh();
  }

  const errors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Task" : "New task"}</DialogTitle>
          <DialogDescription>
            {!editing
              ? "Add a task to this project."
              : canEditDetails
                ? "Update the details, or discuss it in the thread below."
                : "Update your progress, or discuss it in the thread below."}
          </DialogDescription>
        </DialogHeader>

        {canEditDetails || !task ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FormError message={result?.ok === false ? result.error : null} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={task?.title ?? ""}
                placeholder="What needs to be done?"
                maxLength={200}
                required
                autoFocus={!editing}
                aria-invalid={Boolean(errors?.title)}
              />
              <FieldError message={errors?.title} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={task?.description ?? ""}
                placeholder="Add detail, acceptance criteria, links..."
                rows={4}
                maxLength={20000}
                aria-invalid={Boolean(errors?.description)}
              />
              <FieldError message={errors?.description} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status">Status</Label>
                <Select
                  name="status"
                  defaultValue={task?.status ?? defaultStatus}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((status) => (
                      <SelectItem
                        key={status.value}
                        value={status.value}
                        // Only managers and admins close a task. Disabling the
                        // option states the rule instead of letting the save fail.
                        disabled={status.value === "done" && !canComplete}
                      >
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canComplete && (
                  <p className="text-xs text-muted-foreground">
                    Move to In Review when finished; a manager marks it done.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="priority">Priority</Label>
                <Select name="priority" defaultValue={task?.priority ?? "medium"}>
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((priority) => (
                      <SelectItem key={priority.value} value={priority.value}>
                        {priority.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dueAt">Due date &amp; time</Label>
                <Input
                  id="dueAt"
                  name="dueAt"
                  type="datetime-local"
                  // Shown in the viewer timezone; the action converts it back
                  // to an absolute instant on save.
                  defaultValue={toDateTimeLocal(task?.due_at ?? null)}
                  aria-invalid={Boolean(errors?.dueAt)}
                />
                <FieldError message={errors?.dueAt} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Assignees</Label>
              <AssigneePicker
                team={team}
                value={assigneeIds}
                onChange={setAssigneeIds}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDelete}
                  disabled={deleting || pending}
                >
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Delete
                </Button>
              ) : (
                <span />
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  {editing ? "Save changes" : "Create task"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <TaskDetailReadonly
            task={task}
            projectId={projectId}
            canComplete={canComplete}
            onSaved={() => onOpenChange(false)}
          />
        )}

        {task && (
          <>
            <Separator />
            <Tabs defaultValue="comments">
              <TabsList>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="comments">
                <CommentThread
                  taskId={task.id}
                  team={team}
                  currentProfile={currentProfile}
                />
              </TabsContent>

              <TabsContent value="files">
                <AttachmentPanel
                  taskId={task.id}
                  currentProfile={currentProfile}
                />
              </TabsContent>

              <TabsContent value="activity">
                <TaskActivityFeed taskId={task.id} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>

      {task && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this task?"
          description={
            <>
              <span className="font-medium text-foreground">{task.title}</span>{" "}
              will be permanently deleted, along with its comments, attachments
              and history. This cannot be undone.
            </>
          }
          confirmLabel="Delete task"
          onConfirm={async () => {
            await onDelete();
            setConfirmDelete(false);
          }}
        />
      )}
    </Dialog>
  );
}
