"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { filtersActive, type TaskListFilters } from "@/lib/task-filters";
import type {
  Profile,
  TaskPriority,
  TaskStatus,
} from "@/lib/supabase/database.types";

/**
 * The row of controls above a task list: search, status, priority, assignee.
 *
 * One component for every list. The project board and the general list each
 * had their own copy, which is how one of them ended up with a Clear button
 * and the other without.
 */
export function TaskFilterBar({
  filters,
  onChange,
  onClear,
  team,
  shown,
  total,
  onExport,
  searchLabel = "Search tasks",
  children,
}: {
  filters: TaskListFilters;
  onChange: (patch: Partial<TaskListFilters>) => void;
  onClear: () => void;
  team: Profile[];
  /** Rows on screen after filtering, and the number before it. */
  shown: number;
  total: number;
  /** Offered when there is something to download. */
  onExport?: () => void;
  searchLabel?: string;
  /** Whatever sits at the left of the bar — typically the view tabs. */
  children?: React.ReactNode;
}) {
  const active = filtersActive(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}

      <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder="Search tasks"
          className="h-9 pl-8"
          aria-label={searchLabel}
        />
      </div>

      <Select
        value={filters.status}
        onValueChange={(value) => onChange({ status: value as TaskStatus | "all" })}
      >
        <SelectTrigger size="sm" className="w-[8.5rem]" aria-label="Status">
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
        value={filters.priority}
        onValueChange={(value) =>
          onChange({ priority: value as TaskPriority | "all" })
        }
      >
        <SelectTrigger size="sm" className="w-[8.5rem]" aria-label="Priority">
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

      <Select
        value={filters.assignee}
        onValueChange={(value) => onChange({ assignee: value })}
      >
        <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Assignee">
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

      {active && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      )}

      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {shown} of {total}
        </span>
        {onExport && shown > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            aria-label="Export these tasks as CSV"
            title="Export as CSV"
          >
            <Download />
            <span className="hidden sm:inline">Export</span>
          </Button>
        )}
      </span>
    </div>
  );
}
