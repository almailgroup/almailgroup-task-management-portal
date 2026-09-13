"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  createTelegramLinkCode,
  unlinkTelegram,
  updateNotificationPreferences,
} from "@/lib/data/profile-actions";
import { cn } from "@/lib/utils";
import type { NotificationPreferences } from "@/lib/supabase/database.types";

/**
 * Where task reminders are delivered.
 *
 * A channel with no credentials configured on the server is shown but
 * disabled, with the reason stated — otherwise someone switches it on, hears
 * nothing, and has no way to tell whether the fault is theirs.
 */
export function ReminderSettings({
  preferences,
  email,
  available,
  botUsername,
}: {
  preferences: NotificationPreferences;
  email: string;
  available: { email: boolean; telegram: boolean; whatsapp: boolean };
  botUsername: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    emailEnabled: preferences.email_enabled,
    telegramEnabled: preferences.telegram_enabled,
    whatsappEnabled: preferences.whatsapp_enabled,
    whatsappNumber: preferences.whatsapp_number ?? "",
    remindAssigned: preferences.remind_assigned,
    remindDueSoon: preferences.remind_due_soon,
    remindOverdue: preferences.remind_overdue,
    remindFollowUp: preferences.remind_follow_up,
    dueSoonLeadHours: preferences.due_soon_lead_hours,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    setSaving(true);
    const outcome = await updateNotificationPreferences(form);
    setSaving(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    toast.success("Reminder settings saved");
    router.refresh();
  }

  async function link() {
    setLinking(true);
    const outcome = await createTelegramLinkCode();
    setLinking(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    setCode(outcome.data.code);
  }

  async function unlink() {
    setLinking(true);
    const outcome = await unlinkTelegram();
    setLinking(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    setCode(null);
    set("telegramEnabled", false);
    toast.success("Telegram disconnected");
    router.refresh();
  }

  const telegramLinked = Boolean(preferences.telegram_chat_id);

  return (
    <div className="flex flex-col gap-5">
      <Channel
        icon={<Mail />}
        title="Email"
        detail={email}
        enabled={form.emailEnabled}
        available={available.email}
        unavailableReason="No email provider is configured on the server yet."
        onToggle={(value) => set("emailEnabled", value)}
      />

      <Channel
        icon={<Send />}
        title="Telegram"
        detail={
          telegramLinked ? "Connected to your Telegram chat" : "Not connected"
        }
        enabled={form.telegramEnabled}
        available={available.telegram && telegramLinked}
        unavailableReason={
          !available.telegram
            ? "No Telegram bot is configured on the server yet."
            : "Connect your Telegram account below to switch this on."
        }
        onToggle={(value) => set("telegramEnabled", value)}
      >
        {available.telegram && (
          <div className="mt-2 flex flex-col gap-2">
            {telegramLinked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={unlink}
                disabled={linking}
                className="self-start"
              >
                {linking ? <Loader2 className="animate-spin" /> : <X />}
                Disconnect Telegram
              </Button>
            ) : code ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="leading-relaxed">
                  Open{" "}
                  {botUsername ? (
                    <a
                      href={`https://t.me/${botUsername}?start=${code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-4"
                    >
                      @{botUsername}
                    </a>
                  ) : (
                    "your Telegram bot"
                  )}{" "}
                  and send it this code:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="rounded border border-border bg-background px-2 py-1 font-mono text-sm tracking-widest">
                    /start {code}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(`/start ${code}`);
                      toast.success("Copied");
                    }}
                    aria-label="Copy code"
                  >
                    <Copy />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The code works once. Refresh this page after sending it.
                </p>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={link}
                disabled={linking}
                className="self-start"
              >
                {linking && <Loader2 className="animate-spin" />}
                Connect Telegram
              </Button>
            )}
          </div>
        )}
      </Channel>

      <Channel
        icon={<MessageCircle />}
        title="WhatsApp"
        detail={preferences.whatsapp_number ?? "No number set"}
        enabled={form.whatsappEnabled}
        available={available.whatsapp}
        unavailableReason="No WhatsApp provider is configured on the server yet."
        onToggle={(value) => set("whatsappEnabled", value)}
      >
        {available.whatsapp && (
          <div className="mt-2 flex flex-col gap-1.5">
            <Label htmlFor="whatsappNumber">WhatsApp number</Label>
            <Input
              id="whatsappNumber"
              value={form.whatsappNumber}
              onChange={(event) => set("whatsappNumber", event.target.value)}
              placeholder="+971501234567"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              International format, starting with +.
            </p>
          </div>
        )}
      </Channel>

      <Separator />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Remind me when</legend>

        <Toggle
          id="remindAssigned"
          label="A task is assigned to me"
          checked={form.remindAssigned}
          onChange={(v) => set("remindAssigned", v)}
        />
        <Toggle
          id="remindDueSoon"
          label="A task of mine is due soon"
          checked={form.remindDueSoon}
          onChange={(v) => set("remindDueSoon", v)}
        />
        <Toggle
          id="remindOverdue"
          label="A task of mine is overdue"
          checked={form.remindOverdue}
          onChange={(v) => set("remindOverdue", v)}
        />
        <Toggle
          id="remindFollowUp"
          label="A follow-up comes due"
          checked={form.remindFollowUp}
          onChange={(v) => set("remindFollowUp", v)}
        />

        {form.remindDueSoon && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead">Warn me this many hours ahead</Label>
            <Input
              id="lead"
              type="number"
              min={1}
              max={168}
              value={form.dueSoonLeadHours}
              onChange={(event) =>
                set("dueSoonLeadHours", Number(event.target.value))
              }
              className="max-w-[7rem]"
            />
          </div>
        )}
      </fieldset>

      <div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save reminder settings
        </Button>
      </div>
    </div>
  );
}

function Channel({
  icon,
  title,
  detail,
  enabled,
  available,
  unavailableReason,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  enabled: boolean;
  available: boolean;
  unavailableReason: string;
  onToggle: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-3",
        !available && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {enabled && available && (
              <Badge variant="secondary">
                <Check className="size-3" />
                On
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
          {!available && (
            <p className="mt-1 text-xs text-muted-foreground">
              {unavailableReason}
            </p>
          )}
          {children}
        </div>

        <Checkbox
          checked={enabled && available}
          disabled={!available}
          onCheckedChange={(value) => onToggle(value === true)}
          aria-label={`${title} reminders`}
        />
      </div>
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
