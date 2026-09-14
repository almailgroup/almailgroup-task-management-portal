"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DueDate, PriorityIndicator } from "@/components/tasks/task-meta";
import { initialsFrom } from "@/lib/initials";
import { changeTaskStatus } from "@/lib/data/task-actions";
import { TASK_STATUSES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import type {
  TaskStatus,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

/**
 * Task details as seen by a team member.
 *
 * Everything a manager owns — title, description, priority, due date,
 * assignees — is rendered as text rather than as a disabled form, so nobody
 * types into a field whose save would be refused. Status is the one control,
 * and it saves on its own rather than through the full task form.
 */
export function TaskDetailReadonly({
  task,
  projectId,
  canComplete,
  onSaved,
}: {
  task: TaskWithAssignees;
  projectId: string | null;
  canComplete: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [status, setStatus] = React.useState<TaskStatus>(task.status);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setStatus(task.status), [task.status]);

  async function onStatusChange(next: string) {
    const previous = status;
    setStatus(next as TaskStatus);
    setSaving(true);

    const outcome = await changeTaskStatus(task.id, projectId, next);
    setSaving(false);

    if (!outcome.ok) {
      setStatus(previous); // Fall back to the server's truth.
      toast.error(outcome.error);
      return;
    }

    toast.success("Status updated");
    onSaved?.();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold leading-snug tracking-tight">
          {task.title}
        </h2>
        {task.description ? (
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">
            No description.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="member-status">Status</Label>
          <Select
            value={status}
            onValueChange={onStatusChange}
            disabled={saving}
          >
            <SelectTrigger id="member-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.value === "done" && !canComplete}
                >
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Saving
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium leading-none">Priority</span>
          <div className="flex h-9 items-center">
            <PriorityIndicator priority={task.priority} showLabel />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium leading-none">Due date</span>
          <div className="flex h-9 items-center">
            {task.due_at ? (
              <DueDate dueAt={task.due_at} status={task.status} />
            ) : (
              <span className="text-sm text-muted-foreground">None</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium leading-none">Assignees</span>
        {task.assignees.length === 0 ? (
          <span className="text-sm text-muted-foreground">Unassigned</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {task.assignees.map((person) => (
              <span
                key={person.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 text-xs"
              >
                <Avatar className="size-4">
                  {person.avatar_url && (
                    <AvatarImage src={person.avatar_url} alt="" />
                  )}
                  <AvatarFallback className="text-[8px]">
                    {initialsFrom(person.full_name, person.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[10rem] truncate">
                  {person.full_name ?? person.email}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 rounded-md border border-border bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
        <Eye className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Task details are set by your manager. You can update the status, add
          comments and attach files.
          {!canComplete && " Move it to In Review when it is ready to check."}
        </span>
      </p>
    </div>
  );
}
