"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
/** No seconds here: the label is announced on focus, not read as a ticker. */
const labelTimeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const fullDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Midnight-local for a date, so days compare without time-of-day noise. */
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/**
 * The six-week grid for a month, Monday-first, padded with the adjacent
 * months' days so every row is full.
 */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay() is Sunday-first; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

/**
 * Live clock pinned to the foot of the sidebar, ticking to the second.
 * Clicking it opens a calendar on the current month with today marked.
 *
 * Nothing time-dependent renders until after mount: the server has no way to
 * know the viewer's clock or timezone, so rendering it during SSR would
 * guarantee a hydration mismatch.
 */
export function SidebarClock() {
  const nowMs = useNow();
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState<Date | null>(null);

  // Opening always lands on the month the viewer is currently in.
  const handleOpenChange = (next: boolean) => {
    if (next) setViewMonth(startOfDay(new Date()));
    setOpen(next);
  };

  const today = nowMs === null ? null : new Date(nowMs);
  const month = viewMonth ?? today;
  const days = month ? monthGrid(month) : [];
  const viewingThisMonth =
    month != null &&
    today != null &&
    month.getMonth() === today.getMonth() &&
    month.getFullYear() === today.getFullYear();

  const shiftMonth = (delta: number) => {
    setViewMonth((current) => {
      const base = current ?? new Date();
      return new Date(base.getFullYear(), base.getMonth() + delta, 1);
    });
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
          "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        )}
        aria-label={
          today
            ? `${labelTimeFormat.format(today)}, ${fullDateFormat.format(today)}. Open calendar`
            : "Open calendar"
        }
      >
        <CalendarDays className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium tabular-nums leading-tight text-foreground">
            {today ? timeFormat.format(today) : "--:--:--"}
          </span>
          <span className="block truncate text-xs leading-tight">
            {today ? dateFormat.format(today) : " "}
          </span>
        </span>
      </PopoverTrigger>

      <PopoverContent side="top" align="start" className="w-[17.5rem]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {month ? monthFormat.format(month) : ""}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {today ? fullDateFormat.format(today) : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="pb-1 text-center text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {day.slice(0, 2)}
            </div>
          ))}

          {days.map((day) => {
            const inMonth = month != null && day.getMonth() === month.getMonth();
            const isToday = today != null && isSameDay(day, today);

            return (
              <div
                key={day.toISOString()}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-sm tabular-nums",
                  inMonth ? "text-foreground" : "text-muted-foreground/50",
                  isToday &&
                    "bg-foreground font-semibold text-background hover:bg-foreground",
                )}
              >
                {day.getDate()}
              </div>
            );
          })}
        </div>

        {!viewingThisMonth && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => setViewMonth(startOfDay(new Date()))}
          >
            Back to today
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
