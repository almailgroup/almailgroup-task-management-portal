"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  CheckCheck,
  CircleCheck,
  Eye,
  MessageSquare,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/data/notification-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  Notification,
  NotificationType,
  Profile,
} from "@/lib/supabase/database.types";

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  task_assigned: UserPlus,
  task_unassigned: UserMinus,
  task_commented: MessageSquare,
  task_mentioned: AtSign,
  task_review_requested: Eye,
  task_completed: CircleCheck,
};

/**
 * Header bell with a live unread count.
 *
 * Seeded from the server render, then kept current over Realtime. Rows are
 * private to their recipient by RLS, so the subscription only ever delivers
 * this user's notifications.
 */
export function NotificationBell({
  profile,
  initialItems,
  initialUnread,
}: {
  profile: Profile;
  initialItems: Notification[];
  initialUnread: number;
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [items, setItems] = React.useState(initialItems);

  // The list is capped at 30 rows, so the badge cannot be derived from it —
  // someone with more unread than that would be undercounted. Track the
  // server's exact count and adjust it as rows are read or arrive.
  const [unread, setUnread] = React.useState(initialUnread);

  React.useEffect(() => setItems(initialItems), [initialItems]);
  React.useEffect(() => setUnread(initialUnread), [initialUnread]);

  React.useEffect(() => {
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          setItems((current) => {
            if (current.some((n) => n.id === row.id)) return current;
            if (row.read_at === null) setUnread((count) => count + 1);
            return [row, ...current].slice(0, 30);
          });
          toast(row.title, { description: row.body ?? undefined });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.id]);

  async function onOpenItem(notification: Notification) {
    if (notification.read_at === null) {
      setItems((current) =>
        current.map((n) =>
          n.id === notification.id
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
      setUnread((count) => Math.max(0, count - 1));
      await markNotificationRead(notification.id);
    }
    router.refresh();
  }

  async function onMarkAll() {
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    );
    setUnread(0);

    const outcome = await markAllNotificationsRead();
    if (!outcome.ok) {
      toast.error(outcome.error);
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-[14px] text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Notifications
          </span>
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="size-3" />
              Mark all read
            </button>
          )}
        </div>

        <Separator />

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. You will be told when work is assigned to you.
          </p>
        ) : (
          <ul className="scrollbar-thin max-h-96 overflow-y-auto">
            {items.map((notification) => {
              const Icon = ICONS[notification.type] ?? Bell;
              const href = notification.project_id
                ? `/projects/${notification.project_id}`
                : notification.task_id
                  ? "/general"
                  : "/dashboard";

              return (
                <li key={notification.id}>
                  <Link
                    href={href}
                    onClick={() => onOpenItem(notification)}
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/60",
                      notification.read_at === null && "bg-accent/40",
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {notification.title}
                        </span>
                        {notification.read_at === null && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-foreground"
                            aria-hidden
                          />
                        )}
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {relativeTime(notification.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
