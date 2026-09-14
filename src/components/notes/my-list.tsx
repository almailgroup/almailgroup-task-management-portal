"use client";

import * as React from "react";
import { ListChecks, Pin, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NoteEditor } from "@/components/notes/note-editor";
import {
  createNote,
  deleteNote,
  setNotePinned,
} from "@/lib/data/note-actions";
import { cn } from "@/lib/utils";
import type { NoteWithItems, Profile } from "@/lib/supabase/database.types";

/**
 * My List — a private daily list, shaped like the Notes app on a phone.
 *
 * One screen at a time below `lg`: the list, then the note, with a back
 * button. Both panes side by side above it. The local copy is the source of
 * truth while the page is open — a personal list has no second editor to race
 * with, and re-syncing from the server mid-keystroke is what makes this kind
 * of page feel unreliable.
 */
export function MyList({
  initialNotes,
  profile,
  team,
}: {
  initialNotes: NoteWithItems[];
  /** Who is reading, so a list can say whether it is theirs. */
  profile: Profile;
  /** The directory the share picker offers. */
  team: Profile[];
}) {
  const [notes, setNotes] = React.useState(initialNotes);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const active = notes.find((note) => note.id === activeId) ?? null;

  // Two panes can show a note straight away; one pane must not. Opening the
  // page on a phone should land on the list, the way Notes does, rather than
  // dropping you inside whichever note happens to be first.
  //
  // Deciding this after mount rather than during render keeps the server and
  // the first client render identical.
  React.useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    setActiveId((current) => current ?? initialNotes[0]?.id ?? null);
  }, [initialNotes]);

  // Sharing changes who a list belongs to and who else is on it, and that is
  // the server's answer, not this component's. Text being typed is still the
  // local copy's business — the editor holds that until it saves.
  React.useEffect(() => {
    setNotes((current) =>
      initialNotes.map((fresh) => {
        const local = current.find((note) => note.id === fresh.id);
        return local ? { ...local, ...fresh, items: local.items } : fresh;
      }),
    );
  }, [initialNotes]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(q) ||
        note.body.toLowerCase().includes(q) ||
        note.items.some((item) => item.content.toLowerCase().includes(q)),
    );
  }, [notes, query]);

  /** Patch one note in place, keeping pinned-first / newest-first order. */
  const patchNote = React.useCallback(
    (noteId: string, patch: Partial<NoteWithItems>) => {
      setNotes((current) =>
        current.map((note) =>
          note.id === noteId ? { ...note, ...patch } : note,
        ),
      );
    },
    [],
  );

  async function onCreate() {
    setCreating(true);
    const outcome = await createNote();
    setCreating(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    const note: NoteWithItems = {
      ...outcome.data,
      items: [],
      owner: profile,
      collaborators: [],
      mine: true,
    };
    setNotes((current) => [note, ...current]);
    setActiveId(note.id);
  }

  async function onDelete(noteId: string) {
    const previous = notes;
    setNotes((current) => current.filter((note) => note.id !== noteId));
    if (activeId === noteId) setActiveId(null);

    const outcome = await deleteNote(noteId);
    if (!outcome.ok) {
      setNotes(previous);
      toast.error(outcome.error);
    }
  }

  async function onTogglePin(note: NoteWithItems) {
    const pinned = !note.pinned;
    patchNote(note.id, { pinned });

    const outcome = await setNotePinned(note.id, pinned);
    if (!outcome.ok) {
      patchNote(note.id, { pinned: !pinned });
      toast.error(outcome.error);
    }
  }

  const pending = notes.find((n) => n.id === confirmDelete);

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col lg:flex-row">
      {/* ---- List ---------------------------------------------------- */}
      <section
        aria-label="Your notes"
        className={cn(
          "flex min-h-0 flex-col border-border lg:w-80 lg:shrink-0 lg:border-e xl:w-96",
          // One screen at a time on a phone.
          active ? "hidden lg:flex" : "flex",
        )}
      >
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-tight">My List</h1>
            <Button size="sm" onClick={onCreate} disabled={creating}>
              <Plus />
              New note
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your notes"
              aria-label="Search your notes"
              className="ps-9"
            />
          </div>
        </header>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-3">
              <EmptyState
                compact
                icon={notes.length === 0 ? <ListChecks /> : <Search />}
                title={notes.length === 0 ? "No notes yet" : "No matches"}
                description={
                  notes.length === 0
                    ? "Start one for what you need to get through today."
                    : `Nothing matches “${query.trim()}”.`
                }
                action={
                  notes.length === 0 ? (
                    <Button size="sm" onClick={onCreate} disabled={creating}>
                      <Plus />
                      New note
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(note.id)}
                    aria-current={note.id === activeId ? "true" : undefined}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-3 text-start transition-colors",
                      note.id === activeId
                        ? "bg-accent"
                        : "hover:bg-accent/60",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {note.pinned && (
                        <Pin className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                        {note.title.trim() || "New note"}
                      </span>
                      {(!note.mine || note.collaborators.length > 0) && (
                        <Users
                          className="size-3 shrink-0 text-muted-foreground"
                          aria-label={
                            note.mine
                              ? `Shared with ${note.collaborators.length}`
                              : `Shared by ${note.owner?.full_name ?? "someone"}`
                          }
                        />
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0">{dayLabel(note.updated_at)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {note.mine
                          ? previewOf(note)
                          : `${note.owner?.full_name ?? "Shared"} · ${previewOf(note)}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---- Note ---------------------------------------------------- */}
      <section
        aria-label="Note"
        className={cn(
          "min-h-0 flex-1 flex-col",
          active ? "flex" : "hidden lg:flex",
        )}
      >
        {active ? (
          <NoteEditor
            key={active.id}
            note={active}
            profile={profile}
            team={team}
            onBack={() => setActiveId(null)}
            onPatch={(patch: Partial<NoteWithItems>) =>
              patchNote(active.id, patch)
            }
            onTogglePin={() => onTogglePin(active)}
            onRequestDelete={() => setConfirmDelete(active.id)}
            onLeft={() => {
              setNotes((current) => current.filter((n) => n.id !== active.id));
              setActiveId(null);
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <ListChecks className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Pick a note, or start a new one.
            </p>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete this note?"
        description={
          pending
            ? `“${pending.title.trim() || "New note"}” and everything on it will be gone. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDelete) void onDelete(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/** "Today", "Yesterday", or a short date — the Notes app's own shorthand. */
function dayLabel(iso: string): string {
  const then = new Date(iso);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(then)) / 86_400_000,
  );

  if (days === 0) {
    return then.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (days === 1) return "Yesterday";
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The line under the title: what is left to do, or the note's own text. */
function previewOf(note: NoteWithItems): string {
  const open = note.items.filter((item) => !item.done);
  if (note.items.length > 0) {
    const done = note.items.length - open.length;
    const next = open[0]?.content.trim();
    const progress = `${done}/${note.items.length}`;
    return next ? `${progress} · ${next}` : `${progress} · all done`;
  }
  return note.body.trim().split("\n")[0] || "No additional text";
}
