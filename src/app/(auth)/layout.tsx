import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";

/** Centred, chrome-free shell for the sign-in and registration screens. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 pointer-coarse:min-h-10">
          <div className="flex size-6 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
            A
          </div>
          <span className="text-sm font-medium tracking-tight">Almailgroup</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
