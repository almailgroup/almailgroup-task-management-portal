import { describe, expect, it } from "vitest";

import { describeAuthError, isWrongCredentials } from "@/lib/auth/errors";

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

describe("isWrongCredentials", () => {
  /**
   * The one failure that has to stay vague. Everything else is named, because
   * "incorrect email or password" sent people off retyping a password that was
   * right — and on a rate limit, every retry made it worse.
   */
  it("recognises a genuine bad password, by code or by message", () => {
    expect(isWrongCredentials({ code: "invalid_credentials" })).toBe(true);
    expect(isWrongCredentials({ message: "Invalid login credentials" })).toBe(true);
  });

  it("does not swallow the failures that are worth naming", () => {
    expect(isWrongCredentials({ code: "over_request_rate_limit", status: 429 })).toBe(false);
    expect(isWrongCredentials({ message: "Email not confirmed" })).toBe(false);
    expect(isWrongCredentials({ message: "fetch failed" })).toBe(false);
    expect(isWrongCredentials({})).toBe(false);
  });

  it("hands those to a message that says what to do", () => {
    expect(describeAuthError({ code: "over_request_rate_limit", status: 429 })).toContain(
      "Wait a minute",
    );
    expect(describeAuthError({ message: "Email not confirmed" })).toContain(
      "needs confirming",
    );
  });
});

describe("when the auth service itself fails", () => {
  /**
   * Taken from a real outage: the token endpoint returned 500, 502 and 504 in
   * turn while the database was unreachable, and every one of them reached the
   * sign-in form as "Incorrect email or password."
   */
  it.each([500, 502, 503, 504])("names a %i rather than blaming the password", (status) => {
    const text = describeAuthError({ status, message: "Internal Server Error" });
    expect(text).toContain(String(status));
    expect(text).toContain("Nothing is wrong with your details");
  });

  it("still treats those as something other than bad credentials", () => {
    expect(isWrongCredentials({ status: 502, message: "Bad Gateway" })).toBe(false);
  });
});
