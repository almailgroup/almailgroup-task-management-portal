import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Placeholder for the Phase 4 dashboard. The route exists now so the auth
 * middleware has a valid post-sign-in destination.
 */
export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1>Dashboard</h1>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Coming in Phase 4</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Metric cards, project switching and task views land with the project
          and task engine.
        </CardContent>
      </Card>
    </main>
  );
}
