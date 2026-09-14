import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-md)]">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="mt-1 text-base font-semibold tracking-tight">
          Not found
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          This page does not exist, or you do not have access to it.
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
