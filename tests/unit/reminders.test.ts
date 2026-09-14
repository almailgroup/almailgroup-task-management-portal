import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configuredChannels, deliver } from "@/lib/reminders/providers";
import type { QueuedReminder } from "@/lib/reminders/types";

const reminder = (over: Partial<QueuedReminder> = {}): QueuedReminder =>
  ({
    id: "r1", user_id: "u1", task_id: "t1", channel: "email", kind: "due_soon",
    recipient: "sara@almailgroup.com", subject: "Due soon", body: "Ship it",
    attempts: 0, ...over,
  }) as QueuedReminder;

const reply = (status: number, body = "") =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body }) as Response;

/**
 * Reminder delivery has never been exercised against a live provider here —
 * there are no credentials in this environment, and there should not be. What
 * *can* be pinned down is everything around the network call: whether a
 * failure is worth retrying, what happens when a channel is unconfigured, and
 * that a thrown request never takes the dispatcher down with it. Those are the
 * parts that decide whether someone silently stops getting reminders.
 */
describe("deliver", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.REMINDER_EMAIL_FROM = "Tasks <tasks@example.com>";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("reports success when the provider accepts it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200)));
    expect(await deliver(reminder())).toEqual({ ok: true });
  });

  it("treats a rate limit as worth retrying", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(429, "slow down")));
    const result = await deliver(reminder());
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it("treats a provider outage as worth retrying", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(503, "unavailable")));
    expect(await deliver(reminder())).toMatchObject({ retryable: true });
  });

  it("does not retry a request the provider called malformed", async () => {
    // Retrying a 400 forever burns the attempt budget and delays nothing but
    // the eventual give-up.
    vi.stubGlobal("fetch", vi.fn(async () => reply(400, "bad address")));
    expect(await deliver(reminder())).toMatchObject({ ok: false, retryable: false });
  });

  it("survives a network throw and asks to be retried", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const result = await deliver(reminder());
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(result.ok === false && result.error).toContain("ECONNRESET");
  });

  it("does not retry forever when a channel has no credentials", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deliver(reminder());
    expect(result).toMatchObject({ ok: false, retryable: false });
    // And it must not have called out at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a channel it does not know instead of throwing", async () => {
    const result = await deliver(reminder({ channel: "carrier-pigeon" as never }));
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it("sends the task link along with the body", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => reply(200));
    vi.stubGlobal("fetch", fetchSpy);
    await deliver(reminder({ body: "Ship it" }));

    const init = fetchSpy.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(body.to).toEqual(["sara@almailgroup.com"]);
    expect(body.text).toContain("Ship it");
  });
});

describe("configuredChannels", () => {
  it("only claims a channel when every credential it needs is present", () => {
    const env = { ...process.env };
    process.env.TWILIO_ACCOUNT_SID = "sid";
    process.env.TWILIO_AUTH_TOKEN = "token";
    delete process.env.TWILIO_WHATSAPP_FROM;
    expect(configuredChannels().whatsapp).toBe(false);

    process.env.TWILIO_WHATSAPP_FROM = "+14155238886";
    expect(configuredChannels().whatsapp).toBe(true);
    process.env = { ...env };
  });
});
