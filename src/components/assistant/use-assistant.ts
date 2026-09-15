"use client";

import * as React from "react";

import { askAssistant } from "@/lib/data/assistant-actions";
import { useI18n } from "@/lib/i18n/client";
import type { AssistantMessage } from "@/lib/assistant/types";

export type Assistant = {
  messages: AssistantMessage[];
  draft: string;
  setDraft: (value: string) => void;
  pending: boolean;
  send: (text: string) => void;
  clear: () => void;
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/**
 * The AI assistant's conversation.
 *
 * Held once, in AppShell, and handed to both the rail panel and the mobile
 * drawer panel. All of it is shared — not just the thread: when each panel
 * kept its own `pending` and `draft`, the two surfaces disagreed about whether
 * a question was in flight, and a viewport that crossed the `lg` breakpoint
 * with the drawer open could fire two requests into one thread.
 */
export function useAssistant(): Assistant {
  const [messages, setMessages] = React.useState<AssistantMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const { t, tm } = useI18n();

  const send = React.useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || pending) return;

      const asked: AssistantMessage = {
        id: newId(),
        role: "user",
        text: question,
        at: new Date().toISOString(),
      };
      const history = [...messages, asked];

      setMessages(history);
      setDraft("");
      setPending(true);

      void (async () => {
        let reply: string;
        try {
          const outcome = await askAssistant(history);
          reply = outcome.ok ? outcome.data.text : tm(outcome.error);
        } catch {
          // A Server Action rejects outright when the network drops or the
          // deployment 500s. Without this the spinner ran forever and the
          // panel stayed disabled — and since it is no longer a dialog that
          // unmounts, closing and reopening did not clear it either.
          reply = t("assistant.unreachable");
        }

        setMessages((current) => [
          ...current,
          {
            id: newId(),
            role: "assistant",
            text: reply,
            at: new Date().toISOString(),
          },
        ]);
        setPending(false);
      })();
    },
    [messages, pending, t, tm],
  );

  const clear = React.useCallback(() => {
    if (pending) return;
    setMessages([]);
  }, [pending]);

  return { messages, draft, setDraft, pending, send, clear };
}
