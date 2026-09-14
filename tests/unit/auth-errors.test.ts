import { describe, expect, it } from "vitest";

import { describeAuthError } from "@/lib/auth/errors";

describe("describeAuthError", () => {
  /**
   * The message that started this: shown verbatim, it tells someone signing up
   * neither what went wrong nor that there is a way around it.
   */
  it("explains the confirmation-email cap and offers the way round it", () => {
    const text = describeAuthError({
      message: "email rate limit exceeded",
      status: 429,
    });

    expect(text).toContain("not created");
    expect(text).toContain("Team page");
    expect(text).not.toContain("rate limit exceeded");
  });

  it("recognises the cap by its error code as well as its wording", () => {
    expect(
      describeAuthError({ code: "over_email_send_rate_limit", message: "" }),
    ).toContain("confirmation emails");
  });

  it("separates a general throttle from the email cap", () => {
    const text = describeAuthError({ message: "too many requests", status: 429 });
    expect(text).toBe("Too many attempts in a short time. Wait a minute and try again.");
  });

  it("points an existing account at signing in", () => {
    expect(describeAuthError({ message: "User already registered" })).toContain(
      "Sign in instead",
    );
  });

  it("turns an unrecognised fragment into a sentence", () => {
    expect(describeAuthError({ message: "something odd happened" })).toBe(
      "Something odd happened.",
    );
    expect(describeAuthError({ message: "already a sentence." })).toBe(
      "Already a sentence.",
    );
  });

  it("says something useful when there is no message at all", () => {
    expect(describeAuthError({})).toBe("Something went wrong. Please try again.");
  });
});
