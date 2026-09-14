"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The keyboard shortcuts, in one place, on `?`.
 *
 * Each of these existed already and none of them was written down anywhere a
 * person would find it. A shortcut nobody knows about is decoration.
 */
const GROUPS: { title: string; rows: { keys: string[]; does: string }[] }[] = [
  {
    title: "Anywhere",
    rows: [
      { keys: ["⌘", "K"], does: "Search tasks, pages and commands" },
      { keys: ["N"], does: "New task" },
      { keys: ["/"], does: "Jump to the search box on this page" },
      { keys: ["?"], does: "This list" },
      { keys: ["Esc"], does: "Close whatever is open" },
    ],
  },
  {
    title: "On the board",
    rows: [
      { keys: ["Space"], does: "Pick up or drop the focused card" },
      { keys: ["↑", "↓", "←", "→"], does: "Move a picked-up card" },
    ],
  },
  {
    title: "In a note",
    rows: [
      { keys: ["Enter"], does: "Next line" },
      { keys: ["Backspace"], does: "Remove an empty line" },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            They work anywhere you are not typing into a field.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
                {group.title}
              </h3>
              <dl className="divide-y divide-border rounded-xl border border-border">
                {group.rows.map((row) => (
                  <div
                    key={row.does}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <dt className="text-sm">{row.does}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {row.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-6 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] leading-4"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
