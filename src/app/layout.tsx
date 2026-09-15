import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { I18nProvider } from "@/lib/i18n/client";
import { directionFor } from "@/lib/i18n";
import { getLocale, getTimeZone } from "@/lib/i18n/server";
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

// Geist has no Arabic glyphs. Loaded for every page so switching language
// never waits on a font, and only used when the document is Arabic.
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The language is a cookie the selector sets; `lang` and `dir` on the root
  // element are what make the whole layout mirror for Arabic, not just the
  // words. Everything below reads the same cookie through the provider.
  const [locale, timeZone] = await Promise.all([getLocale(), getTimeZone()]);

  return (
    <html lang={locale} dir={directionFor(locale)} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable}`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider locale={locale} timeZone={timeZone}>
            {children}
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
