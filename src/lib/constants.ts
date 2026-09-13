import type { TaskPriority, TaskStatus, UserRole } from "@/lib/supabase/database.types";

/**
 * Single source of truth for task vocabulary.
 *
 * Every visual treatment here is greyscale. Status and priority are separated
 * by fill weight, border and iconography instead of hue, which is what keeps
 * the board readable while staying strictly monochrome.
 */

export type StatusMeta = {
  value: TaskStatus;
  label: string;
  /** Badge variant from `@/components/ui/badge`. */
  variant: "default" | "secondary" | "outline" | "muted" | "subtle";
};

export const TASK_STATUSES: readonly StatusMeta[] = [
  { value: "todo", label: "To Do", variant: "subtle" },
  { value: "in_progress", label: "In Progress", variant: "secondary" },
  { value: "in_review", label: "In Review", variant: "outline" },
  { value: "done", label: "Done", variant: "default" },
] as const;

export type PriorityMeta = {
  value: TaskPriority;
  label: string;
  /** Filled bars out of four — a colourless severity ramp. */
  weight: 1 | 2 | 3 | 4;
};

export const TASK_PRIORITIES: readonly PriorityMeta[] = [
  { value: "low", label: "Low", weight: 1 },
  { value: "medium", label: "Medium", weight: 2 },
  { value: "high", label: "High", weight: 3 },
  { value: "urgent", label: "Urgent", weight: 4 },
] as const;

export type RoleMeta = {
  value: UserRole;
  label: string;
  description: string;
};

export const USER_ROLES: readonly RoleMeta[] = [
  {
    value: "admin",
    label: "Admin",
    description: "Full access across every project and member.",
  },
  {
    value: "manager",
    label: "Manager",
    description: "Creates projects, assigns work and manages tasks.",
  },
  {
    value: "member",
    label: "Team Member",
    description: "Works on assigned tasks and collaborates on comments.",
  },
] as const;

export const statusMeta = (status: TaskStatus): StatusMeta =>
  TASK_STATUSES.find((s) => s.value === status) ?? TASK_STATUSES[0];

export const priorityMeta = (priority: TaskPriority): PriorityMeta =>
  TASK_PRIORITIES.find((p) => p.value === priority) ?? TASK_PRIORITIES[0];

export const roleMeta = (role: UserRole): RoleMeta =>
  USER_ROLES.find((r) => r.value === role) ?? USER_ROLES[2];
