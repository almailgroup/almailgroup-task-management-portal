"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  ClipboardList,
  CornerDownLeft,
  Hash,
  Keyboard,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  Plus,
  Search,
  StickyNote,
  Sunrise,
  User,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { createNote } from "@/lib/data/note-actions";
import { searchTasks, type TaskSearchHit } from "@/lib/data/task-actions";
import { statusMeta } from "@/lib/constants";
import { isSearchable } from "@/lib/search";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShortcutsDialog } from "@/components/layout/shortcuts-dialog";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/supabase/database.types";

type Entry = {
  id: string;
  label: string;
  hint?: string;
  /** Where it goes, or `run` for something it does on the spot. */
  href?: string;
  run?: () => void | Promise<void>;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
};

/**
 * Command palette, opened with Cmd/Ctrl+K.
 *
 * Once someone is on a dozen projects, the sidebar stops being a navigation
 * tool and becomes a list to scan. This makes every destination one search
 * away without taking hands off the keyboard.
 */
export function CommandPalette({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { resolvedTheme, setTheme } = useTheme();

  /**
   * Tasks matching what has been typed.
   *
   * The palette knew every page in the app and none of its contents, so
   * finding a task meant remembering which project it was in. Results come
   * from the server because no one page holds every task, and they are
   * debounced so a fast typist sends one query rather than eight.
   */
  const [hits, setHits] = React.useState<TaskSearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    const needle = query.trim();
    if (!isSearchable(needle)) {
      setHits([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    let current = true;
    const timer = setTimeout(async () => {
      const found = await searchTasks(needle);
      // The answer to an older keystroke must never overwrite a newer one.
      if (!current) return;
      setHits(found);
      setSearching(false);
    }, 200);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const newNote = React.useCallback(async () => {
    const outcome = await createNote();
    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    router.push("/my-list");
    router.refresh();
  }, [router]);

  const entries = React.useMemo<Entry[]>(
    () => [
      // Actions first: someone who opened this with a verb in mind should not
      // have to scroll past every page in the app to find it.
      { id: "new-task", label: "New task", href: "/general?new=1", icon: Plus, group: "Actions", hint: "n" },
      { id: "new-note", label: "New note in My List", run: newNote, icon: StickyNote, group: "Actions" },
      {
        id: "theme",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
        icon: Moon,
        group: "Actions",
      },
      { id: "shortcuts", label: "Keyboard shortcuts", run: () => setShortcutsOpen(true), icon: Keyboard, group: "Actions", hint: "?" },
      { id: "signout", label: "Sign out", href: "/auth/signout", icon: LogOut, group: "Actions" },
      { id: "today", label: "Today", href: "/today", icon: Sunrise, group: "Go to" },
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Go to" },
      { id: "general", label: "General tasks", href: "/general", icon: ClipboardList, group: "Go to" },
      { id: "my-list", label: "My List", href: "/my-list", icon: ListChecks, group: "Go to" },
      { id: "tasks", label: "All tasks", href: "/tasks?filter=all", icon: Search, group: "Go to" },
      { id: "team", label: "Team", href: "/team", icon: Users, group: "Go to" },
      { id: "profile", label: "Profile", href: "/profile", icon: User, group: "Go to" },
      { id: "overdue", label: "Overdue tasks", href: "/tasks?filter=overdue", icon: Search, group: "Filters" },
      { id: "due-today", label: "Due today", href: "/tasks?filter=due_today", icon: Search, group: "Filters" },
      { id: "in-review", label: "In review", href: "/tasks?filter=in_review", icon: Search, group: "Filters" },
      ...projects.map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        hint: project.description ?? undefined,
        href: `/projects/${project.id}`,
        icon: Hash,
        group: "Projects",
      })),
    ],
    [projects, resolvedTheme, setTheme, newNote],
  );

  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;

    const matches = entries.filter((entry) =>
      `${entry.label} ${entry.hint ?? ""}`.toLowerCase().includes(needle),
    );

    // Tasks lead: typing words rather than a page name means looking for
    // something in the workspace, not for a link to it.
    const taskEntries: Entry[] = hits.map((hit) => ({
      id: `task-${hit.id}`,
      label: hit.title,
      hint: [hit.projectName ?? "General", statusMeta(hit.status).label].join(" · "),
      href: `/tasks?filter=all&task=${hit.id}`,
      icon: CheckSquare,
      group: "Tasks",
    }));

    // Eight is a list; more than that is a search, and the browser page can
    // show every match with the filters beside it.
    if (hits.length >= 8) {
      taskEntries.push({
        id: "search-all",
        label: `All tasks matching “${query.trim()}”`,
        href: `/tasks?filter=all&q=${encodeURIComponent(query.trim())}`,
        icon: Search,
        group: "Tasks",
      });
    }

    return [...taskEntries, ...matches];
  }, [entries, hits, query]);

  // Cmd/Ctrl+K toggles from anywhere, except while typing somewhere else.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      // Bare-letter shortcuts must never fire while someone is writing, or
      // typing "note" into a comment would open a dialog mid-sentence.
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable === true;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "n") {
        event.preventDefault();
        router.push("/general?new=1");
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (event.key === "/") {
        // Focus whatever this page calls its search box.
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[aria-label^="Search"]',
        );
        if (search) {
          event.preventDefault();
          search.focus();
          search.select();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      return;
    }
    // Radix keeps the dialog mounted through its exit animation, so without
    // this the palette's own input holds focus for the best part of a second
    // after it looks closed — long enough to swallow the next keystroke, and
    // the bare-letter shortcuts refuse to fire while a field has focus.
    inputRef.current?.blur();
  }, [open]);

  React.useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  React.useEffect(() => {
    listRef.current
      ?.querySelectorAll("[data-entry]")
      ?.[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(entry: Entry) {
    setOpen(false);
    if (entry.run) void entry.run();
    else if (entry.href) router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  }

  let lastGroup = "";

  return (
    <>
    <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Search and navigate</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter actions, pages and projects. Arrow keys to move, Enter to run.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tasks, pages and commands..."
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
            aria-label="Search"
          />
        </div>

        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {searching ? "Searching…" : `Nothing matches “${query}”.`}
          </p>
        ) : (
          <ul
            ref={listRef}
            className="scrollbar-thin max-h-80 overflow-y-auto p-1.5"
            role="listbox"
          >
            {results.map((entry, index) => {
              const Icon = entry.icon;
              const showGroup = entry.group !== lastGroup;
              lastGroup = entry.group;

              return (
                <React.Fragment key={entry.id}>
                  {showGroup && (
                    <li className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                      {entry.group}
                    </li>
                  )}
                  <li data-entry>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(entry)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        index === active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{entry.label}</span>
                        {entry.group === "Tasks" && entry.hint && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.hint}
                          </span>
                        )}
                      </span>
                      {index === active && (
                        <CornerDownLeft className="size-3 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move · <Kbd>↵</Kbd> to open
          </span>
          <span>
            <Kbd>esc</Kbd> to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] leading-4">
      {children}
    </kbd>
  );
}

/** The header affordance that tells people the palette exists. */
export function CommandHint() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        )
      }
      aria-label="Search"
      className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-10 pointer-coarse:px-3"
    >
      <Search className="size-4 sm:size-3.5" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden rounded border border-border bg-muted px-1 font-mono text-[10px] leading-4 sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}
