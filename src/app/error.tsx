"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary. Deliberately generic: the underlying message can
 * contain internals, so it is logged rather than rendered.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-md)]">
        <h1 className="text-base font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          That page could not be loaded. Try again, and if it keeps happening
          contact your workspace admin.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
        <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    </div>
  );
}
