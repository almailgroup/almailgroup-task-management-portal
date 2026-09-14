"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addNoteItem,
  clearDoneItems,
  deleteNoteItem,
  saveNote,
  updateNoteItem,
} from "@/lib/data/note-actions";
import { cn } from "@/lib/utils";
import type {
  NoteWithItems,
  PersonalNoteItem,
} from "@/lib/supabase/database.types";

/** How long to wait after the last keystroke before writing. */
const SAVE_DELAY = 700;

/**
 * One note: a title, a checklist, and room for anything else.
 *
 * Text saves itself on a debounce rather than behind a Save button — the
 * thing being written is a list of errands, and nobody should lose one to a
 * forgotten click. Ticking a box writes immediately and optimistically,
 * because that tap has to feel instant on a phone.
 */
export function NoteEditor({
  note,
  onBack,
  onPatch,
  onTogglePin,
  onRequestDelete,
}: {
  note: NoteWithItems;
  onBack: () => void;
  onPatch: (patch: Partial<NoteWithItems>) => void;
  onTogglePin: () => void;
  onRequestDelete: () => void;
}) {
  const [title, setTitle] = React.useState(note.title);
  const [body, setBody] = React.useState(note.body);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [adding, setAdding] = React.useState(false);

  // Which item to put the cursor in once it has been rendered.
  const focusNext = React.useRef<string | null>(null);
  const itemRefs = React.useRef(new Map<string, HTMLInputElement>());

  const items = note.items;
  const remaining = items.filter((item) => !item.done).length;

  React.useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const input = itemRefs.current.get(id);
    if (input) {
      input.focus();
      focusNext.current = null;
    }
  }, [items]);

  // --- Title and body: debounced auto-save ---------------------------------
  const dirty = title !== note.title || body !== note.body;

  React.useEffect(() => {
    if (!dirty) return;
    setStatus("saving");

    const timer = setTimeout(async () => {
      const outcome = await saveNote(note.id, { title, body });
      if (!outcome.ok) {
        setStatus("idle");
        toast.error(outcome.error);
        return;
      }
      onPatch({ title, body, updated_at: outcome.data.updatedAt });
      setStatus("saved");
    }, SAVE_DELAY);

    return () => clearTimeout(timer);
    // onPatch is stable enough for this; re-running on it would restart the
    // timer on every parent render and never let a save land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, dirty, note.id]);

  // Nothing is lost if the tab closes mid-debounce — but say so honestly:
  // the last few hundred milliseconds of typing can be.
  React.useEffect(() => {
    if (status !== "saved") return;
    const timer = setTimeout(() => setStatus("idle"), 1600);
    return () => clearTimeout(timer);
  }, [status]);

  // --- Checklist -----------------------------------------------------------
  function patchItems(next: PersonalNoteItem[]) {
    onPatch({ items: next });
  }

  async function toggleItem(item: PersonalNoteItem) {
    const done = !item.done;
    patchItems(
      items.map((row) => (row.id === item.id ? { ...row, done } : row)),
    );

    const outcome = await updateNoteItem(item.id, { done });
    if (!outcome.ok) {
      patchItems(items);
      toast.error(outcome.error);
    }
  }

  function setItemContent(itemId: string, content: string) {
    patchItems(
      items.map((row) => (row.id === itemId ? { ...row, content } : row)),
    );
  }

  async function commitItem(item: PersonalNoteItem, content: string) {
    if (content === item.content) return;
    const outcome = await updateNoteItem(item.id, { content });
    if (!outcome.ok) toast.error(outcome.error);
  }

  async function addItem() {
    if (adding) return;
    setAdding(true);
    const outcome = await addNoteItem(note.id, "");
    setAdding(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    focusNext.current = outcome.data.id;
    patchItems([...items, outcome.data]);
  }

  async function removeItem(item: PersonalNoteItem) {
    const previous = items;
    const index = items.findIndex((row) => row.id === item.id);
    patchItems(items.filter((row) => row.id !== item.id));

    // Carry the cursor to the line above, the way a text editor would.
    const above = previous[index - 1];
    if (above) itemRefs.current.get(above.id)?.focus();

    const outcome = await deleteNoteItem(item.id);
    if (!outcome.ok) {
      patchItems(previous);
      toast.error(outcome.error);
    }
  }

  async function onClearDone() {
    const previous = items;
    patchItems(items.filter((item) => !item.done));

    const outcome = await clearDoneItems(note.id);
    if (!outcome.ok) {
      patchItems(previous);
      toast.error(outcome.error);
    }
  }

  const doneCount = items.length - remaining;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-1 border-b border-border px-2 py-2 sm:px-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="lg:hidden"
          aria-label="Back to your notes"
        >
          <ChevronLeft />
          Notes
        </Button>

        <span className="min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground">
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : items.length > 0
                ? `${doneCount} of ${items.length} done`
                : ""}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onTogglePin}
          aria-label={note.pinned ? "Unpin this note" : "Pin this note"}
          title={note.pinned ? "Unpin" : "Pin to the top"}
        >
          {note.pinned ? <PinOff /> : <Pin />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Note actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={onClearDone}
              disabled={doneCount === 0}
            >
              <Check />
              Clear ticked lines
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRequestDelete}>
              <Trash2 />
              Delete note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            maxLength={200}
            aria-label="Note title"
            className={cn(
              "w-full bg-transparent text-xl font-semibold tracking-tight outline-none",
              "placeholder:font-normal placeholder:text-muted-foreground",
            )}
          />

          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id} className="group/line flex items-start gap-3 py-1.5">
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  aria-pressed={item.done}
                  aria-label={
                    item.done
                      ? `Mark “${item.content || "this line"}” as not done`
                      : `Mark “${item.content || "this line"}” as done`
                  }
                  className={cn(
                    // A generous hit box around a small circle: the tick is
                    // the most-tapped thing on this page.
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                    "pointer-coarse:size-7",
                    item.done
                      ? "border-foreground bg-foreground text-background"
                      : "border-input hover:border-foreground/40",
                  )}
                >
                  {item.done && <Check className="size-3.5" />}
                </button>

                <input
                  ref={(node) => {
                    if (node) itemRefs.current.set(item.id, node);
                    else itemRefs.current.delete(item.id);
                  }}
                  value={item.content}
                  onChange={(event) =>
                    setItemContent(item.id, event.target.value)
                  }
                  onBlur={(event) => commitItem(item, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitItem(item, item.content);
                      void addItem();
                    }
                    // Backspace on an empty line removes it, as in a list editor.
                    if (
                      event.key === "Backspace" &&
                      item.content === "" &&
                      items.length > 1
                    ) {
                      event.preventDefault();
                      void removeItem(item);
                    }
                  }}
                  placeholder="Something to do"
                  maxLength={1000}
                  className={cn(
                    "min-h-7 w-full bg-transparent py-0.5 text-[0.9375rem] leading-relaxed outline-none",
                    "placeholder:text-muted-foreground",
                    item.done && "text-muted-foreground line-through",
                  )}
                />

                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  aria-label={`Remove “${item.content || "this line"}”`}
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
                    "hover:bg-accent hover:text-foreground",
                    // Quiet until you reach for it with a mouse; always there
                    // on touch, where there is no hover to reveal it.
                    "opacity-0 focus-visible:opacity-100 group-hover/line:opacity-100",
                    "pointer-coarse:size-8 pointer-coarse:opacity-100",
                  )}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addItem}
            disabled={adding}
            className={cn(
              "-mt-1 flex items-center gap-3 rounded-md py-1.5 text-left text-[0.9375rem] text-muted-foreground transition-colors",
              "hover:text-foreground disabled:opacity-50",
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-input pointer-coarse:size-7">
              <Plus className="size-3.5" />
            </span>
            Add a to-do
          </button>

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Anything else worth remembering…"
            maxLength={20000}
            aria-label="Note text"
            rows={6}
            className={cn(
              "min-h-40 w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed outline-none",
              "placeholder:text-muted-foreground",
            )}
          />
        </div>
      </div>
    </div>
  );
}
