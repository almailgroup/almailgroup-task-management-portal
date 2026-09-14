/**
 * Turning Supabase's auth errors into something a person can act on.
 *
 * They arrive as lowercase fragments written for whoever is reading the logs —
 * "email rate limit exceeded" — and were being shown to the person signing up
 * word for word. Each one below says what happened, whether anything was
 * saved, and what to do next.
 */

type AuthErrorLike = { message?: string; status?: number; code?: string };

/**
 * Whether a failed sign-in was simply the wrong email or password.
 *
 * This is the one failure that must stay vague — saying which half was wrong,
 * or that no such account exists, hands anyone a way to test which of the
 * company's addresses are registered. Every other failure is safe to name, and
 * far more useful named.
 */
export function isWrongCredentials(error: AuthErrorLike): boolean {
  return (
    error.code === "invalid_credentials" ||
    (error.message ?? "").toLowerCase().includes("invalid login credentials")
  );
}

export function describeAuthError(error: AuthErrorLike): string {
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  /**
   * The cap on confirmation emails, which is Supabase's built-in mail service
   * rather than anything this app controls. It is a handful an hour, meant for
   * development, and a workspace onboarding its staff runs through it quickly.
   */
  if (
    code === "over_email_send_rate_limit" ||
    message.includes("rate limit") ||
    (error.status === 429 && message.includes("email"))
  ) {
    return (
      "The workspace has sent as many confirmation emails as it is allowed " +
      "this hour, so the account was not created. Either wait an hour and try " +
      "again, or ask an admin to add the account from the Team page — that " +
      "way needs no email at all."
    );
  }

  // A blanket 429 that is not about email: repeated attempts from one address.
  if (error.status === 429 || code === "over_request_rate_limit") {
    return "Too many attempts in a short time. Wait a minute and try again.";
  }

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "An account already exists for that email address. Sign in instead, or reset the password.";
  }

  if (code === "signup_disabled" || message.includes("signups not allowed")) {
    return "New sign-ups are turned off for this workspace. Ask an admin to add your account from the Team page.";
  }

  if (message.includes("for security purposes")) {
    return "That was a moment ago — wait a few seconds and try again.";
  }

  if (code === "weak_password" || message.includes("password should be")) {
    return "That password is too weak. Use at least 8 characters, mixing letters, numbers and symbols.";
  }

  if (message.includes("unable to validate email") || code === "validation_failed") {
    return "That email address does not look right. Check it and try again.";
  }

  if (message.includes("email not confirmed")) {
    return "This account still needs confirming. Open the link in the confirmation email, or ask an admin to confirm it for you.";
  }

  if (error.status === 0 || message.includes("fetch failed") || message.includes("network")) {
    return "Could not reach the server. Check your connection and try again.";
  }

  /**
   * The sign-in service itself failed — a 500 from the auth server, or a 502
   * or 504 from in front of it. Nothing the person typed is wrong, and telling
   * them otherwise sends them round retyping a password that was right.
   */
  if (typeof error.status === "number" && error.status >= 500) {
    return `The sign-in service is not responding right now (error ${error.status}). Nothing is wrong with your details — wait a moment and try again.`;
  }

  // Anything unrecognised: show it, but as a sentence rather than a fragment.
  const raw = (error.message ?? "").trim();
  if (!raw) return "Something went wrong. Please try again.";
  const sentence = raw.charAt(0).toUpperCase() + raw.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
