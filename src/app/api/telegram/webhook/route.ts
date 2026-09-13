import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Telegram bot webhook, used only to link an account.
 *
 * A user generates a code in their profile and sends "/start <code>" to the
 * bot. Telegram delivers the chat id here, which is the piece the app cannot
 * discover on its own. The code is single-use and is cleared once redeemed, so
 * a leaked code cannot be replayed to redirect someone's reminders.
 *
 * Telegram authenticates the webhook with a secret token header set when the
 * webhook is registered.
 */

export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const text = update?.message?.text?.trim() ?? "";
  const chatId = update?.message?.chat?.id;

  if (!chatId) return NextResponse.json({ ok: true });

  const match = text.match(/^\/start\s+([A-Za-z0-9]{6,32})$/);
  if (!match) {
    await reply(
      chatId,
      "Open your profile in the Almailgroup Task Portal, choose Telegram reminders, and send me the code it shows.",
    );
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  const { data: profileRow } = await supabase
    .from("notification_preferences")
    .select("user_id")
    .eq("telegram_link_code", match[1])
    .maybeSingle();

  if (!profileRow) {
    await reply(chatId, "That code is not valid or has already been used.");
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("notification_preferences")
    .update({
      telegram_chat_id: String(chatId),
      telegram_enabled: true,
      telegram_link_code: null,
    })
    .eq("user_id", profileRow.user_id);

  await reply(
    chatId,
    error
      ? "Something went wrong linking this chat. Try generating a new code."
      : "Linked. You will get your task reminders here.",
  );

  return NextResponse.json({ ok: true });
}

async function reply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}
