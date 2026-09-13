/** Shared attachment constants and helpers, safe on both client and server. */

/** Matches the storage bucket limit and the DB check constraint. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const ATTACHMENT_BUCKET = "task-attachments";

/** How long a download link stays valid, in seconds. */
export const SIGNED_URL_TTL = 60 * 10;

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build the object key for an upload.
 *
 * The task id is the first path segment because the storage policy reads it to
 * decide whether the uploader may write here. The random prefix keeps two
 * people uploading "screenshot.png" from colliding.
 */
export function attachmentPath(taskId: string, fileName: string): string {
  const safe = fileName
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(-120)
    .replace(/^[.-]+/, "");

  return `${taskId}/${crypto.randomUUID()}-${safe || "file"}`;
}

/** Hostname of a link attachment, for display. Falls back to the raw value. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
