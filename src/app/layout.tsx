import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Almailgroup Task Management Portal",
    template: "%s · Almailgroup",
  },
  description:
    "Plan, assign and track work across Almailgroup projects — projects, tasks, Kanban boards and real-time collaboration.",
  applicationName: "Almailgroup Task Management Portal",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The app is laid out for the screen it is on, so there is nothing to zoom
  // into: pinching only ever happened because a page had overflowed sideways
  // or because Safari zoomed in by itself when a field was focused. Both are
  // fixed at the source — this stops the browser doing it uninvited.
  maximumScale: 1,
  userScalable: false,
  // Matches the page grounds, so the browser chrome on a phone blends into
  // the app instead of framing it in a colour the design never uses.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f4" },
    { media: "(prefers-color-scheme: dark)", color: "#2c2d32" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
