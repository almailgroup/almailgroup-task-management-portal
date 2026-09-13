import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Metric tile. Emphasis is typographic — a large tabular figure over a small
 * muted label — so the row reads as data rather than decoration.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon,
  emphasis,
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  /** Draws the stronger border used for items that need attention. */
  emphasis?: boolean;
  /** Makes the whole tile a link to the matching task list. */
  href?: string;
}) {
  const className = cn(
    "group block rounded-lg border bg-card p-4 transition-colors",
    emphasis ? "border-foreground/30" : "border-border",
    href && "hover:border-foreground/40 focus-visible:outline-none",
  );

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {icon && (
          <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
        )}
      </div>

      <p className="mt-2 text-2xl font-semibold tabular-nums leading-none tracking-tight">
        {value}
      </p>

      {hint && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          {hint}
          {href && (
            <ArrowRight
              className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </p>
      )}
    </>
  );

  if (!href) return <div className={className}>{body}</div>;

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/** Colourless progress bar: filled portion in the foreground tone. */
export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-foreground transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
