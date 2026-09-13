"use client";

import * as React from "react";
import { CornerDownLeft, Loader2, RotateCcw, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
 * MAHAM AI — the assistant, living in the sidebar rail rather than in a modal
 * over the board. The point is that you can read a task while you ask about
 * it, so this never covers the work.
 *
 * The thread is held by AppShell and passed in, so the rail and the mobile
 * drawer show one conversation rather than drifting apart, and closing the
 * panel keeps the history.
 *
 * Every answer comes from a Server Action that builds its own view of the
 * board under the caller's permissions: this component never holds task data
 * and never talks to a model directly.
 */
export function MahamPanel({
  messages,
  onMessages,
  onClose,
}: {
  messages: MahamMessage[];
  onMessages: React.Dispatch<React.SetStateAction<MahamMessage[]>>;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Keep the newest turn in view as the thread grows.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending]);

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
    onMessages(history);
    setDraft("");
    setPending(true);

    const outcome = await askMaham(history);

    onMessages((current) => [
      ...current,
      {
        id: newId(),
        role: "assistant",
        text: outcome.ok ? outcome.data.text : outcome.error,
        at: new Date().toISOString(),
      },
    ]);
    setPending(false);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-2 border-b border-chrome-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight tracking-tight">
              MAHAM AI
            </h2>
            <p className="truncate text-[0.6875rem] leading-tight text-muted-foreground">
              Answers from the tasks you can see
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onMessages([])}
              disabled={pending}
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <RotateCcw />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close MAHAM AI"
            title="Back to navigation"
          >
            <X />
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <Welcome onPick={send} disabled={pending} />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <Bubble key={message.id} message={message} />
            ))}
            {pending && <Thinking />}
          </div>
        )}
      </div>

      <form
        className="border-t border-chrome-border p-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <div className="flex items-end gap-1.5">
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
            className="max-h-28 min-h-[2.25rem] resize-none py-1.5 text-sm"
            aria-label="Ask MAHAM AI"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={pending || !draft.trim()}
            aria-label="Send"
          >
            {pending ? <Loader2 className="animate-spin" /> : <CornerDownLeft />}
          </Button>
        </div>
      </form>
    </div>
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
    <div className="flex flex-col gap-3 py-1">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Ask me where the work stands. I read the same board you do, so I can
        only tell you about tasks you already have access to.
      </p>

      <div className="flex flex-col items-start gap-1.5">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            disabled={disabled}
            onClick={() => onPick(starter)}
            className={cn(
              "max-w-full rounded-full border border-border px-3 py-1.5 text-left text-xs transition-colors",
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
    <div className={cn("flex gap-2", mine && "justify-end")}>
      {!mine && (
        <span
          aria-hidden
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted"
        >
          <Sparkles className="size-2.5" />
        </span>
      )}

      <div
        className={cn(
          "max-w-[88%] rounded-lg px-3 py-2 text-[0.8125rem] leading-relaxed",
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
 * indent instead of starting again under the bullet — which matters more here
 * than it did in a wide modal.
 */
function AnswerText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let lines: string[] = [];

  // Consecutive plain lines become one paragraph, so a run of short facts sits
  // on tight leading instead of being spaced apart like separate answers.
  const flushLines = () => {
    if (lines.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
        {lines.join("\n")}
      </p>,
    );
    lines = [];
  };

  const flushBullets = () => {
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
      flushLines();
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    if (line.trim() === "") {
      flushLines();
      continue;
    }
    lines.push(line);
  }
  flushBullets();
  flushLines();

  return <div className="flex flex-col gap-2">{blocks}</div>;
}

function Thinking() {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted"
      >
        <Sparkles className="size-2.5" />
      </span>
      <span className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2.5">
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
