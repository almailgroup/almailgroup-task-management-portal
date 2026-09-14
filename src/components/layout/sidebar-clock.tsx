"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  daysBetween,
  describeDayGap,
  describeDayGapDetail,
} from "@/lib/dates";
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

/** A stable per-day key: ISO would shift with the timezone at the boundary. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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
  const [selected, setSelected] = React.useState<Date | null>(null);
  /** The cell the arrow keys are on. Only one day is ever in the tab order. */
  const [focusedDay, setFocusedDay] = React.useState<Date | null>(null);

  const gridRef = React.useRef<HTMLDivElement>(null);
  const shouldRestoreFocus = React.useRef(false);

  // Opening lands on the selected date's month, or on this month when there
  // is no selection — what a date picker is expected to do.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const landing = selected ?? startOfDay(new Date());
      setViewMonth(landing);
      setFocusedDay(landing);
    }
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

  const shiftYear = (delta: number) => {
    setViewMonth((current) => {
      const base = current ?? new Date();
      return new Date(base.getFullYear() + delta, base.getMonth(), 1);
    });
  };

  const jumpToToday = () => {
    const now = startOfDay(new Date());
    setViewMonth(now);
    setFocusedDay(now);
  };

  /** Move the keyboard cursor, following it into the next month if needed. */
  const moveFocus = (deltaDays: number) => {
    setFocusedDay((current) => {
      const base = current ?? startOfDay(new Date());
      const next = new Date(base);
      next.setDate(base.getDate() + deltaDays);
      shouldRestoreFocus.current = true;
      setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1));
      return next;
    });
  };

  // After an arrow key walks into another month the grid is rebuilt, so the
  // focused cell has to be found again once it exists.
  React.useEffect(() => {
    if (!shouldRestoreFocus.current || !focusedDay) return;
    shouldRestoreFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(focusedDay)}"]`)
      ?.focus();
  }, [focusedDay, month]);

  function onGridKeyDown(event: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[event.key]);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      moveFocus(event.shiftKey ? -365 : -28);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      moveFocus(event.shiftKey ? 365 : 28);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const base = focusedDay ?? startOfDay(new Date());
      // Monday-first, matching the grid.
      const weekday = (base.getDay() + 6) % 7;
      moveFocus(event.key === "Home" ? -weekday : 6 - weekday);
    }
  }

  const gap =
    selected && today ? daysBetween(today, selected) : null;
  const detail = gap === null ? null : describeDayGapDetail(gap);

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

      <PopoverContent side="top" align="start" className="w-[20rem]">
        <div className="mb-2 flex items-center justify-between gap-1">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {month ? monthFormat.format(month) : ""}
          </p>
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shiftYear(-1)}
              aria-label="Previous year"
              title="Previous year"
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              title="Previous month"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              title="Next month"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shiftYear(1)}
              aria-label="Next year"
              title="Next year"
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>

        {/* One roving tab stop: Tab reaches the grid, arrows move within it,
            which is how a date grid is expected to behave. */}
        <div
          ref={gridRef}
          role="grid"
          aria-label="Choose a date"
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-7 gap-0.5"
        >
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              role="columnheader"
              aria-label={day}
              className="pb-1 text-center text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {day.slice(0, 2)}
            </div>
          ))}

          {days.map((day) => {
            const inMonth = month != null && day.getMonth() === month.getMonth();
            const isToday = today != null && isSameDay(day, today);
            const isSelected = selected != null && isSameDay(day, selected);
            const isFocused = focusedDay != null && isSameDay(day, focusedDay);

            return (
              <button
                key={dayKey(day)}
                type="button"
                data-day={dayKey(day)}
                role="gridcell"
                aria-current={isToday ? "date" : undefined}
                aria-selected={isSelected}
                tabIndex={isFocused ? 0 : -1}
                aria-label={fullDateFormat.format(day)}
                onClick={() => {
                  setSelected(isSelected ? null : day);
                  setFocusedDay(day);
                }}
                className={cn(
                  "press flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors pointer-coarse:h-10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  inMonth ? "text-foreground" : "text-muted-foreground/50",
                  !isSelected && !isToday && "hover:bg-accent",
                  // Today is outlined, the selection is filled — so both can
                  // be seen at once, which is the whole point of the panel.
                  isToday && !isSelected && "font-semibold ring-1 ring-inset ring-foreground/40",
                  isSelected && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        {/* The answer to "how far away is that?" */}
        <div
          aria-live="polite"
          className={cn(
            "mt-3 rounded-xl border px-3 py-2.5",
            selected
              ? "border-border bg-muted/60"
              : "border-dashed border-border",
          )}
        >
          {selected && gap !== null ? (
            <>
              <p className="text-lg font-bold leading-tight tracking-tight">
                {describeDayGap(gap)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {fullDateFormat.format(selected)}
                {detail && ` · ${detail}`}
              </p>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Pick any day, past or future, to count the days between it and
              today.
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={jumpToToday}
            disabled={viewingThisMonth && selected === null}
          >
            Today
          </Button>
          {selected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(null)}
              aria-label="Clear the selected date"
            >
              <X />
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
