/** Inline validation message rendered under a form field. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-muted-foreground">
      {message}
    </p>
  );
}

/** Form-level error banner. Monochrome: emphasis comes from the border. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-foreground/30 bg-muted px-3 py-2 text-sm text-foreground"
    >
      {message}
    </div>
  );
}
