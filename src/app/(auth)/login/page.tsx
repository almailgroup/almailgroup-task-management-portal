import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Placeholder for the Phase 3 email/password sign-in form. The route exists
 * now so the auth middleware has a valid redirect target.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Email and password authentication arrives in Phase 3.
        </CardContent>
      </Card>
    </main>
  );
}
