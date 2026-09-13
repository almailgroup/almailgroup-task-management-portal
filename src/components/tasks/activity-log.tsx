import { initialsFrom } from "@/components/ui/avatar";
import { statusMeta } from "@/lib/constants";
import type {
  TaskActivityAction,
  TaskActivityWithActor,
  TaskStatus,
} from "@/lib/supabase/database.types";

/** Human-readable line for one audit row. */
function describe(entry: TaskActivityWithActor): string {
  const to = (value: string | null) =>
    value ? readableStatus(value) : "nothing";

  switch (entry.action satisfies TaskActivityAction) {
    case "created":
      return "created this task";
    case "status_changed":
      return `moved it from ${to(entry.old_value)} to ${to(entry.new_value)}`;
    case "priority_changed":
      return `changed priority from ${entry.old_value ?? "none"} to ${entry.new_value ?? "none"}`;
    case "due_date_changed":
      return entry.new_value
        ? `set the due date to ${entry.new_value}`
        : "cleared the due date";
    case "assignee_added":
      return `assigned ${entry.new_value ?? "someone"}`;
    case "assignee_removed":
      return `unassigned ${entry.old_value ?? "someone"}`;
    case "commented":
      return "commented";
    case "updated":
      return entry.field === "description"
        ? "updated the description"
        : `renamed it to "${entry.new_value ?? ""}"`;
    default:
      return "updated this task";
  }
}

/** Status values are stored as enum keys; show the label people recognise. */
function readableStatus(value: string): string {
  const known = ["todo", "in_progress", "in_review", "done"];
  return known.includes(value)
    ? statusMeta(value as TaskStatus).label
    : value;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function ActivityLog({
  entries,
}: {
  entries: TaskActivityWithActor[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {entries.map((entry) => {
        const actor = entry.actor;
        const name = actor?.full_name ?? actor?.email ?? "Someone";

        return (
          <li key={entry.id} className="flex items-start gap-2 text-sm">
            <span
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[9px] font-medium text-muted-foreground"
              aria-hidden
            >
              {initialsFrom(actor?.full_name, actor?.email)}
            </span>
            <p className="leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">{name}</span>{" "}
              {describe(entry)}
              <span className="ml-1.5 whitespace-nowrap text-xs">
                {relativeTime(entry.created_at)}
              </span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
