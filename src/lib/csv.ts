import { priorityMeta, statusMeta } from "@/lib/constants";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * A task list as a spreadsheet.
 *
 * The one export a company portal is actually asked for: the list as it is
 * on screen — same filters, same order — as a file someone can send on, sort
 * in Excel, or paste into a report.
 */

/** RFC 4180: quote anything with a comma, quote or newline; double quotes. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tasksToCsv(
  tasks: TaskWithAssignees[],
  projectName?: (projectId: string | null) => string,
): string {
  const header = [
    "Title",
    ...(projectName ? ["Project"] : []),
    "Status",
    "Priority",
    "Due",
    "Assignees",
    "Created",
    "Description",
  ];

  const rows = tasks.map((task) => [
    task.title,
    ...(projectName ? [projectName(task.project_id)] : []),
    statusMeta(task.status).label,
    priorityMeta(task.priority).label,
    task.due_at ?? "",
    task.assignees.map((p) => p.full_name ?? p.email).join("; "),
    task.created_at,
    task.description ?? "",
  ]);

  // CRLF line endings: what Excel expects, and what the RFC specifies.
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A filename that sorts by date and says what it is. */
export function csvFilename(scope: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = scope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "tasks"}-${stamp}.csv`;
}
