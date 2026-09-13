"use client";

import * as React from "react";
import { CornerDownLeft, Loader2, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { askMaham } from "@/lib/data/maham-actions";
import { cn } from "@/lib/utils";
import type { MahamMessage } from "@/lib/maham/types";

/** Openers that match what the assistant can actually answer today. */
const STARTERS = [
  "What is overdue?",
  "What is due today?",
  "What should I work on next?",
  "What is waiting in review?",
  "Give me a status summary",
];

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/**
 * MAHAM AI — the assistant panel.
 *
 * Every answer is produced by a Server Action that builds its own view of the
 * board under the caller's permissions, so this component never holds task
 * data and never talks to a model directly. Swapping the local brain for
 * Gemini behind the Cloudflare Worker changes nothing here.
 */
export function MahamChat({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = React.useState<MahamMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Keep the newest turn in view as the thread grows.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;

    const asked: MahamMessage = {
      id: newId(),
      role: "user",
      text: question,
      at: new Date().toISOString(),
    };

    const history = [...messages, asked];
    setMessages(history);
    setDraft("");
    setPending(true);

    const outcome = await askMaham(history);

    setMessages((current) => [
      ...current,
      {
        id: newId(),
        role: "assistant",
        text: outcome.ok
          ? outcome.data.text
          : outcome.error,
        at: new Date().toISOString(),
      },
    ]);
    setPending(false);
    inputRef.current?.focus();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(40rem,88svh)] max-w-xl flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold tracking-tight">
                MAHAM AI
              </DialogTitle>
              <DialogDescription className="text-xs">
                Answers from the tasks you can see — nothing more.
              </DialogDescription>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessages([])}
                disabled={pending}
              >
                <RotateCcw />
                Clear
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {messages.length === 0 ? (
            <Welcome onPick={send} disabled={pending} />
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <Bubble key={message.id} message={message} />
              ))}
              {pending && <Thinking />}
            </div>
          )}
        </div>

        <form
          className="border-t border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a newline, as in the comment box.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Ask about your tasks…"
              rows={1}
              maxLength={2000}
              className="max-h-32 min-h-[2.5rem] resize-none py-2"
              aria-label="Ask MAHAM AI"
            />
            <Button type="submit" size="icon" disabled={pending || !draft.trim()}>
              {pending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CornerDownLeft />
              )}
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="mt-2 px-1 text-[0.6875rem] leading-tight text-muted-foreground">
            Enter to send · Shift+Enter for a new line
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Welcome({
  onPick,
  disabled,
}: {
  onPick: (question: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-4 py-6">
      <div>
        <p className="text-[0.9375rem] font-medium">
          Ask me where the work stands.
        </p>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
          I read the same board you do, so I can only tell you about tasks you
          already have access to.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            disabled={disabled}
            onClick={() => onPick(starter)}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-xs transition-colors",
              "text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: MahamMessage }) {
  const mine = message.role === "user";

  return (
    <div className={cn("flex gap-2.5", mine && "justify-end")}>
      {!mine && (
        <span
          aria-hidden
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted"
        >
          <Sparkles className="size-3" />
        </span>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
          mine
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card",
        )}
      >
        <span className="sr-only">
          {mine ? "You asked: " : "MAHAM AI answered: "}
        </span>
        <AnswerText text={message.text} />
      </div>
    </div>
  );
}

/**
 * Renders an answer's plain text.
 *
 * MAHAM writes lists as "• " lines. Rendering those as real list items rather
 * than as one pre-wrapped block is what gives a wrapped task title a hanging
 * indent instead of starting again under the bullet.
 */
function AnswerText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="flex flex-col gap-1">
        {bullets.map((item, index) => (
          <li key={index} className="flex gap-1.5">
            <span aria-hidden className="select-none text-muted-foreground">
              •
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("• ")) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
        {line}
      </p>,
    );
  }
  flush();

  return <div className="flex flex-col gap-2">{blocks}</div>;
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5" aria-live="polite">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted"
      >
        <Sparkles className="size-3" />
      </span>
      <span className="flex items-center gap-1 rounded-lg border border-border bg-card px-3.5 py-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
            style={{ animationDelay: `${dot * 160}ms` }}
          />
        ))}
        <span className="sr-only">MAHAM AI is thinking</span>
      </span>
    </div>
  );
}
