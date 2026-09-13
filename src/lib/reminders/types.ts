/** One queued message, as the dispatcher sees it. */
export type QueuedReminder = {
  id: string;
  user_id: string;
  task_id: string | null;
  channel: "email" | "telegram" | "whatsapp";
  kind: "assigned" | "due_soon" | "overdue" | "follow_up";
  recipient: string;
  subject: string | null;
  body: string;
  attempts: number;
};

/**
 * What a provider reports back.
 *
 * `retryable` separates a transient failure (rate limit, provider down) from a
 * permanent one (bad number, template rejected). Only the first is worth
 * another attempt; retrying the second forever would just fill the queue.
 */
export type DeliveryResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string; retryable: boolean };

export type Channel = QueuedReminder["channel"];
