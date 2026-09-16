"use client";

import * as React from "react";
import { CornerDownLeft, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { deleteTeamMessage, sendTeamMessage } from "@/lib/data/chat-actions";
import { formatDateTime } from "@/lib/dates";
import { initialsFrom } from "@/lib/initials";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type {
  Profile,
  TeamMessage,
  TeamMessageWithAuthor,
} from "@/lib/supabase/database.types";

/**
 * The team room.
 *
 * Server-rendered with the last hundred messages so the page is readable
 * before any JavaScript runs, then kept live over the same realtime channel
 * the task board uses. Row-level security applies to what realtime forwards,
 * so subscribing cannot show anything a page load would have hidden.
 */
export function TeamChat({
  profile,
  team,
  initial,
}: {
  profile: Profile;
  team: Profile[];
  initial: TeamMessageWithAuthor[];
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const { t, tm, tag, timeZone } = useI18n();

  const [messages, setMessages] = React.useState(initial);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLTextAreaElement>(null);

  // Realtime rows arrive without the joined profile, so the author is looked
  // up from the team the page was rendered with.
  const byId = React.useMemo(() => {
    const map = new Map<string, Profile>();
    for (const person of [...team, profile]) map.set(person.id, person);
    return map;
  }, [team, profile]);

  React.useEffect(() => {
    const channel = supabase
      .channel("team-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages" },
        (payload) => {
          const row = payload.new as TeamMessage;
          setMessages((current) =>
            // The sender's own message is already here from the optimistic
            // insert below; realtime echoes it back a moment later.
            current.some((message) => message.id === row.id)
              ? current
              : [...current, { ...row, author: byId.get(row.author_id) ?? null }],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "team_messages" },
        (payload) => {
          const gone = payload.old as TeamMessage;
          setMessages((current) =>
            current.filter((message) => message.id !== gone.id),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, byId]);

  // Grow the box to the message. Height is reset before it is measured, or it
  // only ratchets upwards and never comes back down when text is deleted.
  React.useEffect(() => {
    const box = boxRef.current;
    if (!box || box.offsetParent === null) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [draft]);

  // Follow the conversation as it grows.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setDraft("");
    const outcome = await sendTeamMessage(text);
    setSending(false);

    if (!outcome.ok) {
      // Give the words back rather than losing them to a failed send.
      setDraft(text);
      toast.error(tm(outcome.error));
    }
  };

  const remove = async (id: string) => {
    const outcome = await deleteTeamMessage(id);
    if (!outcome.ok) toast.error(tm(outcome.error));
    else setMessages((current) => current.filter((m) => m.id !== id));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="scrollbar-thin flex max-h-[calc(100svh-18rem)] min-h-64 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-border bg-card p-3 sm:p-4">
        {messages.length === 0 ? (
          <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
            {t("chat.empty")}
          </p>
        ) : (
          messages.map((message, index) => (
            <Message
              key={message.id}
              message={message}
              mine={message.author_id === profile.id}
              canRemove={
                message.author_id === profile.id || profile.role === "admin"
              }
              // A run of messages from one person in a short space reads as one
              // turn, so only the first of the run carries a name and a face.
              grouped={continues(messages[index - 1], message)}
              onRemove={() => remove(message.id)}
              tag={tag}
              timeZone={timeZone}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* The same composer as the assistant's: one bounded field that lights
          up as a whole, rather than a box with buttons floating beside it. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div
          className={cn(
            "flex flex-col gap-1 rounded-2xl border border-input bg-card px-3 py-2",
            "transition-[border-color,box-shadow]",
            "focus-within:border-foreground focus-within:shadow-[var(--shadow-xs)]",
          )}
        >
          <Textarea
            ref={boxRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a newline — as in the comment box
              // and the assistant, so the whole app agrees about this key.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={t("chat.placeholder")}
            rows={1}
            maxLength={4000}
            className={cn(
              "max-h-48 min-h-0 resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm leading-relaxed",
              "shadow-none focus-visible:border-0 focus-visible:shadow-none",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
            )}
            aria-label={t("chat.placeholder")}
          />

          <div className="flex items-center justify-end gap-2">
            {draft.length > 3400 && (
              <span
                className={cn(
                  "text-[0.6875rem] tabular-nums",
                  draft.length >= 4000 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {4000 - draft.length}
              </span>
            )}
            <Button
              type="submit"
              size="icon-sm"
              disabled={sending || !draft.trim()}
              aria-label={t("chat.send")}
              className="-me-1"
            >
              {sending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CornerDownLeft className="rtl:-scale-x-100" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

/** Whether this message continues the one before it. */
function continues(
  previous: TeamMessageWithAuthor | undefined,
  message: TeamMessageWithAuthor,
): boolean {
  if (!previous || previous.author_id !== message.author_id) return false;
  const gap =
    new Date(message.created_at).getTime() -
    new Date(previous.created_at).getTime();
  return gap < 5 * 60_000;
}

function Message({
  message,
  mine,
  canRemove,
  grouped,
  onRemove,
  tag,
  timeZone,
}: {
  message: TeamMessageWithAuthor;
  mine: boolean;
  canRemove: boolean;
  grouped: boolean;
  onRemove: () => void;
  tag: string;
  timeZone: string;
}) {
  const { t } = useI18n();
  const name = message.author?.full_name ?? message.author?.email ?? "—";

  return (
    <div
      className={cn(
        "group/message flex gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent/50",
        grouped ? "mt-0" : "mt-2.5",
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped && (
          <Avatar className="size-8">
            <AvatarImage src={message.author?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="text-[0.6875rem]">
              {initialsFrom(name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">
              {mine ? t("chat.you") : name}
            </span>
            <time
              dateTime={message.created_at}
              className="text-[0.6875rem] text-muted-foreground"
            >
              {formatDateTime(message.created_at, tag, timeZone)}
            </time>
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.body}
        </p>
      </div>

      {canRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={t("chat.delete")}
          title={t("chat.delete")}
          className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/message:opacity-100 pointer-coarse:opacity-100"
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
