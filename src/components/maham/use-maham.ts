"use client";

import * as React from "react";

import { askMaham } from "@/lib/data/maham-actions";
import type { MahamMessage } from "@/lib/maham/types";

export type Maham = {
  messages: MahamMessage[];
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
 * The MAHAM AI conversation.
 *
 * Held once, in AppShell, and handed to both the rail panel and the mobile
 * drawer panel. All of it is shared — not just the thread: when each panel
 * kept its own `pending` and `draft`, the two surfaces disagreed about whether
 * a question was in flight, and a viewport that crossed the `lg` breakpoint
 * with the drawer open could fire two requests into one thread.
 */
export function useMaham(): Maham {
  const [messages, setMessages] = React.useState<MahamMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const send = React.useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || pending) return;

      const asked: MahamMessage = {
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
          const outcome = await askMaham(history);
          reply = outcome.ok ? outcome.data.text : outcome.error;
        } catch {
          // A Server Action rejects outright when the network drops or the
          // deployment 500s. Without this the spinner ran forever and the
          // panel stayed disabled — and since it is no longer a dialog that
          // unmounts, closing and reopening did not clear it either.
          reply =
            "I could not reach the server. Check your connection and ask me again.";
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
    [messages, pending],
  );

  const clear = React.useCallback(() => {
    if (pending) return;
    setMessages([]);
  }, [pending]);

  return { messages, draft, setDraft, pending, send, clear };
}
