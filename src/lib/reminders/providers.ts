import "server-only";

import type { DeliveryResult, QueuedReminder } from "./types";

/**
 * Delivery adapters.
 *
 * Each provider is behind one function with the same shape, so swapping
 * Resend for SES, or Twilio for Meta's Cloud API, means rewriting one function
 * and nothing else. A channel with no credentials configured reports a
 * non-retryable failure rather than throwing, so one unconfigured provider
 * cannot stop the rest of the queue from going out.
 */

const APP_NAME = "Almailgroup Task Portal";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

/** Link back into the app, appended to every message. */
function appLink(): string {
  const base = appUrl();
  return base ? `\n\n${base}/today` : "";
}

// ---------------------------------------------------------------------------
// Email — Resend
// ---------------------------------------------------------------------------

async function sendEmail(reminder: QueuedReminder): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Email is not configured (RESEND_API_KEY / REMINDER_EMAIL_FROM).",
      retryable: false,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [reminder.recipient],
      subject: reminder.subject ?? APP_NAME,
      text: `${reminder.body}${appLink()}`,
    }),
  });

  if (response.ok) return { ok: true };

  const detail = await response.text().catch(() => "");
  return {
    ok: false,
    error: `Resend ${response.status}: ${detail.slice(0, 200)}`,
    // 429 and 5xx are worth another go; a 4xx means the request itself is wrong.
    retryable: response.status === 429 || response.status >= 500,
  };
}

// ---------------------------------------------------------------------------
// Telegram — Bot API
// ---------------------------------------------------------------------------

async function sendTelegram(reminder: QueuedReminder): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return {
      ok: false,
      error: "Telegram is not configured (TELEGRAM_BOT_TOKEN).",
      retryable: false,
    };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: reminder.recipient,
        text: `*${reminder.subject ?? APP_NAME}*\n${reminder.body}${appLink()}`,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;

  if (response.ok && payload?.ok) return { ok: true };

  const description = payload?.description ?? `HTTP ${response.status}`;
  return {
    ok: false,
    error: `Telegram: ${description}`.slice(0, 200),
    // "bot was blocked" / "chat not found" will never succeed on retry.
    retryable:
      response.status === 429 ||
      (response.status >= 500 && !/blocked|not found|deactivated/i.test(description)),
  };
}

// ---------------------------------------------------------------------------
// WhatsApp — Twilio
//
// Outside the 24-hour customer service window Meta only permits pre-approved
// template messages, so a plain body will be rejected until the recipient has
// messaged the number. See the README for what that means in practice.
// ---------------------------------------------------------------------------

async function sendWhatsApp(reminder: QueuedReminder): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    return {
      ok: false,
      error:
        "WhatsApp is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM).",
      retryable: false,
    };
  }

  const contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_SID;

  const form = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${reminder.recipient}`,
  });

  if (contentSid) {
    // Approved template: the body is passed as a variable rather than free text.
    form.set("ContentSid", contentSid);
    form.set(
      "ContentVariables",
      JSON.stringify({ 1: reminder.subject ?? APP_NAME, 2: reminder.body }),
    );
  } else {
    form.set("Body", `${reminder.subject ?? APP_NAME}\n${reminder.body}${appLink()}`);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );

  if (response.ok) return { ok: true };

  const detail = await response.text().catch(() => "");
  return {
    ok: false,
    error: `Twilio ${response.status}: ${detail.slice(0, 200)}`,
    retryable: response.status === 429 || response.status >= 500,
  };
}

// ---------------------------------------------------------------------------

export async function deliver(reminder: QueuedReminder): Promise<DeliveryResult> {
  try {
    switch (reminder.channel) {
      case "email":
        return await sendEmail(reminder);
      case "telegram":
        return await sendTelegram(reminder);
      case "whatsapp":
        return await sendWhatsApp(reminder);
      default:
        return { ok: false, error: "Unknown channel.", retryable: false };
    }
  } catch (error) {
    // A network-level throw is transient by nature.
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "Send failed",
      retryable: true,
    };
  }
}

/** Which channels have credentials present. Surfaced in the preferences UI. */
export function configuredChannels() {
  return {
    email: Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_EMAIL_FROM),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    whatsapp: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM,
    ),
  };
}
