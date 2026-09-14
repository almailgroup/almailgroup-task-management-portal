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
import { FieldError, FormError } from "@/components/auth/field-error";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { TaskProvenance } from "@/components/tasks/task-meta";
import { isoFromLocalInput, quickDateOptions, toLocalInput } from "@/lib/dates";
import { AttachmentPanel } from "@/components/tasks/attachment-panel";
import { FollowUpPanel } from "@/components/tasks/follow-up-panel";
import { TaskDetailReadonly } from "@/components/tasks/task-detail-readonly";
import { CommentThread } from "@/components/tasks/comment-thread";
import { TaskActivityFeed } from "@/components/tasks/task-activity-feed";
import {
  createTask,
  deleteTask,
  restoreTask,
  updateTask,
} from "@/lib/data/task-actions";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
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
  const i18n = useI18n();
  const { t, tm } = i18n;
  const editing = Boolean(task);
  const canComplete =
    currentProfile.role === "admin" || currentProfile.role === "manager";
  // Title, description, priority, due date and assignees belong to whoever
  // plans the work. Members see them, they do not set them.
  const canEditDetails = canComplete;

  const [pending, setPending] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<{
    id: string;
  }> | null>(null);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([]);

  // The date field is uncontrolled — its own picker manages it — so a preset
  // writes straight into it, in the viewer's own wall-clock time.
  const dueRef = React.useRef<HTMLInputElement>(null);
  const setDue = (iso: string | null) => {
    if (dueRef.current) dueRef.current.value = toLocalInput(iso);
  };

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

    // The date input hands over wall-clock time with no offset. Resolve it to
    // an absolute instant here, where the viewer's timezone is known — the
    // server would read it as its own, which is UTC.
    const localDue = String(formData.get("dueAt") ?? "");
    formData.set("dueAt", localDue ? (isoFromLocalInput(localDue) ?? "") : "");
    const outcome = task
      ? await updateTask(task.id, projectId, null, formData)
      : await createTask(projectId, null, formData);

    setPending(false);

    if (!outcome.ok) {
      setResult(outcome);
      return;
    }

    toast.success(editing ? t("task.updated") : t("task.created"));
    onOpenChange(false);
    router.refresh();
  }

  async function onDelete() {
    if (!task) return;
    setDeleting(true);
    const outcome = await deleteTask(task.id, projectId);
    setDeleting(false);

    if (!outcome.ok) {
      toast.error(tm(outcome.error));
      return;
    }

    // Immediate, and undoable for ten seconds — rather than a question first.
    // A confirmation nobody reads protects nothing; a bin does.
    const { id, title } = task;
    toast.success(t("task.deletedToast"), {
      description: title,
      duration: 10_000,
      action: {
        label: t("common.undo"),
        onClick: async () => {
          const restored = await restoreTask(id, projectId);
          if (!restored.ok) {
            toast.error(tm(restored.error));
            return;
          }
          toast.success(t("task.restored"));
          router.refresh();
        },
      },
    });
    onOpenChange(false);
    router.refresh();
  }

  const errors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("task.title") : t("palette.newTask")}</DialogTitle>
          <DialogDescription>
            {!editing
              ? t("task.addToProject")
              : canEditDetails
                ? t("task.updateDetails")
                : t("task.updateProgress")}
          </DialogDescription>
        </DialogHeader>

        {/* Above the branch, so a member sees the same provenance a manager
            does — the read-only view is a different editor, not less detail. */}
        {task && (
          <TaskProvenance
            createdAt={task.created_at}
            creator={team.find((person) => person.id === task.created_by) ?? null}
          />
        )}

        {canEditDetails || !task ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FormError message={result?.ok === false ? result.error : null} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">{t("task.fieldTitle")}</Label>
              <Input
                id="title"
                name="title"
                defaultValue={task?.title ?? ""}
                placeholder={t("task.titlePlaceholder")}
                maxLength={200}
                required
                autoFocus={!editing}
                aria-invalid={Boolean(errors?.title)}
              />
              <FieldError message={errors?.title} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">{t("task.description")}</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={task?.description ?? ""}
                placeholder={t("task.descriptionPlaceholder")}
                rows={4}
                maxLength={20000}
                aria-invalid={Boolean(errors?.description)}
              />
              <FieldError message={errors?.description} />
            </div>

            {/* Four tracks, with the due date spanning two: a datetime-local
                input needs ~210px of content box and one third of this dialog
                gives it 197px, which pushed the native calendar button out
                past the field's own border. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="status">{t("sort.status")}</Label>
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
                        {t(status.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canComplete && (
                  <p className="text-xs text-muted-foreground">
                    {t("task.reviewHint")}
                  </p>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="priority">{t("sort.priority")}</Label>
                <Select name="priority" defaultValue={task?.priority ?? "medium"}>
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((priority) => (
                      <SelectItem key={priority.value} value={priority.value}>
                        {t(priority.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="dueAt">{t("task.dueDateTime")}</Label>
                <Input
                  ref={dueRef}
                  id="dueAt"
                  name="dueAt"
                  type="datetime-local"
                  // Shown in the viewer timezone; the action converts it back
                  // to an absolute instant on save.
                  defaultValue={toLocalInput(task?.due_at ?? null)}
                  aria-invalid={Boolean(errors?.dueAt)}
                />
                {/* The dates people actually pick, one tap each. The native
                    picker is still there for anything else — but "tomorrow
                    evening" should not take five taps through a calendar. */}
                {canEditDetails && (
                  <div className="flex flex-wrap gap-1.5" aria-label={t("task.quickDates")}>
                    {quickDateOptions(i18n).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setDue(option.value())}
                        className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground pointer-coarse:min-h-9"
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDue(null)}
                      className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-9"
                    >
                      {t("task.noDate")}
                    </button>
                  </div>
                )}
                <FieldError message={errors?.dueAt} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t("table.assignees")}</Label>
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
                  {t("common.delete")}
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
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  {editing ? t("task.saveChanges") : t("task.create")}
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
            <FollowUpPanel task={task} canManage={canEditDetails} />
            <Separator />
            <Tabs defaultValue="comments">
              <TabsList>
                <TabsTrigger value="comments">{t("task.comments")}</TabsTrigger>
                <TabsTrigger value="files">{t("task.files")}</TabsTrigger>
                <TabsTrigger value="activity">{t("task.activity")}</TabsTrigger>
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

    </Dialog>
  );
}
