import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";

/**
 * Foundation page for Phase 1.
 *
 * It doubles as a live check that the design tokens, fonts and component
 * primitives render correctly, and reports whether Supabase credentials are
 * present yet. It is replaced by the real marketing/redirect entry point once
 * the authenticated shell lands.
 */
export default function Home() {
  const configured = isSupabaseConfigured();

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
              A
            </div>
            <span className="text-sm font-medium tracking-tight">
              Almailgroup
            </span>
            <Badge variant="muted" className="hidden sm:inline-flex">
              Task Portal
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button size="sm" variant="outline" asChild>
              <Link href="/login">
                Sign in
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Task Management Portal
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Projects, tasks and real-time collaboration for Almailgroup teams —
            built on Next.js, Supabase and a deliberately monochrome interface.
          </p>
        </div>

        <Separator className="my-10" />

        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Task status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {TASK_STATUSES.map((status) => (
                <Badge key={status.value} variant={status.variant}>
                  {status.label}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Priority scale</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {TASK_PRIORITIES.map((priority) => (
                <div
                  key={priority.value}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{priority.label}</span>
                  <span className="flex gap-0.5" aria-hidden>
                    {[1, 2, 3, 4].map((bar) => (
                      <span
                        key={bar}
                        className={
                          bar <= priority.weight
                            ? "h-3 w-1 rounded-[1px] bg-foreground"
                            : "h-3 w-1 rounded-[1px] bg-border"
                        }
                      />
                    ))}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Setup</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <SetupRow done label="Next.js, TypeScript and Tailwind CSS" />
              <SetupRow done label="Geist typography and monochrome tokens" />
              <SetupRow done label="UI primitives and theme switching" />
              <SetupRow
                done={configured}
                label={
                  configured
                    ? "Supabase credentials detected"
                    : "Add Supabase credentials to .env.local"
                }
              />
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function SetupRow({ done, label }: { done?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CircleCheck className="size-4 shrink-0 text-foreground" />
      ) : (
        <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}
