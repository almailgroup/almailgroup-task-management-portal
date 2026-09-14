"use client";

import * as React from "react";
import {
  ExternalLink,
  File as FileIcon,
  Link2,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addLinkAttachment,
  deleteAttachment,
  getAttachmentUrl,
  recordFileAttachment,
} from "@/lib/data/attachment-actions";
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  attachmentPath,
  formatBytes,
  linkHost,
} from "@/lib/attachments";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import type { Profile, TaskAttachment } from "@/lib/supabase/database.types";

/**
 * Files and links attached to a task.
 *
 * File bytes go straight from the browser to Supabase Storage — a Server
 * Action body is far too small for real attachments — and only the resulting
 * metadata is recorded through an action.
 */
export function AttachmentPanel({
  taskId,
  currentProfile,
}: {
  taskId: string;
  currentProfile: Profile;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const { t, tm } = useI18n();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [items, setItems] = React.useState<TaskAttachment[] | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [showLinkForm, setShowLinkForm] = React.useState(false);
  const [savingLink, setSavingLink] = React.useState(false);
  const [opening, setOpening] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("task_attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(t("attach.loadFailed"));
      setItems([]);
      return;
    }
    setItems(data ?? []);
  }, [supabase, taskId, t]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onFilesPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Let the same file be picked again after a failure.
    event.target.value = "";
    if (files.length === 0) return;

    setUploading(true);

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          t("attach.tooBig", {
            name: file.name,
            size: formatBytes(file.size),
            limit: formatBytes(MAX_ATTACHMENT_BYTES),
          }),
        );
        continue;
      }

      const path = attachmentPath(taskId, file.name);

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        toast.error(t("attach.uploadFailed", { name: file.name }));
        continue;
      }

      const outcome = await recordFileAttachment(taskId, {
        name: file.name,
        storagePath: path,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
      });

      if (!outcome.ok) {
        toast.error(tm(outcome.error));
        continue;
      }
    }

    setUploading(false);
    await load();
  }

  async function onAddLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingLink(true);

    const form = event.currentTarget;
    const outcome = await addLinkAttachment(taskId, null, new FormData(form));
    setSavingLink(false);

    if (!outcome.ok) {
      toast.error(tm(outcome.error));
      return;
    }

    form.reset();
    setShowLinkForm(false);
    await load();
  }

  async function open(attachment: TaskAttachment) {
    if (attachment.kind === "link" && attachment.url) {
      window.open(attachment.url, "_blank", "noopener,noreferrer");
      return;
    }

    // The bucket is private, so mint a short-lived signed URL on demand.
    setOpening(attachment.id);
    const outcome = await getAttachmentUrl(attachment.id);
    setOpening(null);

    if (!outcome.ok) {
      toast.error(tm(outcome.error));
      return;
    }
    window.open(outcome.data.url, "_blank", "noopener,noreferrer");
  }

  async function remove(attachment: TaskAttachment) {
    const outcome = await deleteAttachment(attachment.id);
    if (!outcome.ok) {
      toast.error(tm(outcome.error));
      return;
    }
    setItems((current) =>
      current ? current.filter((a) => a.id !== attachment.id) : current,
    );
  }

  const canRemove = (a: TaskAttachment) =>
    a.uploaded_by === currentProfile.id ||
    currentProfile.role === "admin" ||
    currentProfile.role === "manager";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={onFilesPicked}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {uploading ? t("attach.uploading") : t("attach.upload")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowLinkForm((open) => !open)}
        >
          <Link2 />
          {t("attach.addLink")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("attach.limit", { limit: formatBytes(MAX_ATTACHMENT_BYTES) })}
        </span>
      </div>

      {showLinkForm && (
        <form
          onSubmit={onAddLink}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attachment-name">{t("attach.label")}</Label>
            <Input
              id="attachment-name"
              name="name"
              placeholder={t("attach.labelPlaceholder")}
              maxLength={255}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attachment-url">{t("attach.url")}</Label>
            <Input
              id="attachment-url"
              name="url"
              type="url"
              placeholder="https://..."
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkForm(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={savingLink}>
              {savingLink && <Loader2 className="animate-spin" />}
              {t("attach.addLink")}
            </Button>
          </div>
        </form>
      )}

      {items === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Paperclip className="size-3.5" />
          {t("attach.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
            >
              {attachment.kind === "link" ? (
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              )}

              <button
                type="button"
                onClick={() => open(attachment)}
                className="min-w-0 flex-1 text-start focus-visible:outline-none"
              >
                <span className="block truncate text-sm font-medium">
                  {attachment.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {attachment.kind === "link"
                    ? linkHost(attachment.url ?? "")
                    : formatBytes(attachment.size_bytes)}
                </span>
              </button>

              {opening === attachment.id ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              )}

              {canRemove(attachment) && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(attachment)}
                  aria-label={t("assign.remove", { name: attachment.name })}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
