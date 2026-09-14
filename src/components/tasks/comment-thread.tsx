"use client";

import * as React from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MentionTextarea } from "@/components/tasks/mention-textarea";
import { deleteComment, postComment } from "@/lib/data/comment-actions";
import { MentionText } from "@/lib/mentions";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n";
import type {
  CommentWithAuthor,
  Profile,
} from "@/lib/supabase/database.types";

/**
 * Live comment thread.
 *
 * The initial page is fetched on mount, then a Realtime channel keeps it in
 * sync. Realtime enforces RLS on every change it forwards, so a subscriber only
 * ever receives rows they are allowed to read.
 */
export function CommentThread({
  taskId,
  team,
  currentProfile,
}: {
  taskId: string;
  team: Profile[];
  currentProfile: Profile;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const { t, tm, tag } = useI18n();

  // Comments are append-only for members: deleting one — their own included —
  // is a manager action, so the control is not offered.
  const canModerate =
    currentProfile.role === "admin" || currentProfile.role === "manager";

  const [comments, setComments] = React.useState<CommentWithAuthor[] | null>(
    null,
  );
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Author lookup for realtime rows, which arrive without the joined profile.
  const teamById = React.useMemo(() => {
    const map = new Map<string, Profile>();
    for (const person of team) map.set(person.id, person);
    return map;
  }, [team]);

  React.useEffect(() => {
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from("comments")
        .select("*, author:profiles(*)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error) {
        toast.error(t("comment.loadFailed"));
        setComments([]);
        return;
      }
      setComments((data ?? []) as unknown as CommentWithAuthor[]);
    }

    load();

    const channel = supabase
      .channel(`comments:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const row = payload.new as CommentWithAuthor;
          setComments((current) => {
            if (!current) return current;
            // The optimistic insert from this tab may already be present.
            if (current.some((comment) => comment.id === row.id)) return current;
            return [
              ...current,
              { ...row, author: teamById.get(row.user_id ?? "") ?? null },
            ];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comments",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const removed = payload.old as { id?: string };
          if (!removed.id) return;
          setComments((current) =>
            current
              ? current.filter((comment) => comment.id !== removed.id)
              : current,
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, taskId, teamById, t]);

  // Keep the newest comment in view as the thread grows.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [comments?.length]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    const formData = new FormData();
    formData.set("content", content);
    const outcome = await postComment(taskId, null, formData);
    setSending(false);

    if (!outcome.ok) {
      toast.error(tm(outcome.error));
      return;
    }

    // Realtime delivers the row; clear the draft and let it arrive.
    setDraft("");
  }

  async function remove(commentId: string) {
    const outcome = await deleteComment(commentId);
    if (!outcome.ok) {
      toast.error(tm(outcome.error));
      return;
    }
    setComments((current) =>
      current ? current.filter((comment) => comment.id !== commentId) : current,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="scrollbar-thin flex max-h-64 flex-col gap-3 overflow-y-auto pe-1">
        {comments === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("comment.empty")}
          </p>
        ) : (
          comments.map((comment) => {
            const author = comment.author;

            return (
              <div key={comment.id} className="flex items-start gap-2">
                <Avatar className="mt-0.5 size-6">
                  {author?.avatar_url && (
                    <AvatarImage src={author.avatar_url} alt="" />
                  )}
                  <AvatarFallback className="text-[9px]">
                    {initialsFrom(author?.full_name, author?.email)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {author?.full_name ?? author?.email ?? t("comment.unknownUser")}
                    </span>
                    <span>{formatTime(comment.created_at, t, tag)}</span>
                  </p>
                  <div className="mt-0.5 text-sm leading-relaxed">
                    <MentionText content={comment.content} team={team} />
                  </div>
                </div>

                {canModerate && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(comment.id)}
                    aria-label={t("comment.delete")}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-col gap-1.5">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          team={team}
          onSubmit={send}
          rows={2}
          maxLength={5000}
          placeholder={t("comment.placeholder")}
          aria-label={t("comment.new")}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t("comment.hint")}
          </p>
          <Button size="sm" onClick={send} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("comment.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string, t: Translator["t"], tag: Translator["tag"]): string {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);

  if (minutes < 1) return t("common.justNow");
  if (minutes < 60) return t("common.minutesAgo", { n: minutes });
  if (minutes < 60 * 24) return t("common.hoursAgo", { n: Math.round(minutes / 60) });

  return then.toLocaleDateString(tag, { day: "numeric", month: "short" });
}
