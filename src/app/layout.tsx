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
  /**
   * Installed to a home screen on iOS.
   *
   * `title` is the name under the icon, and without it iOS uses the page
   * title — "Today · Almailgroup" or whichever page happened to be open when
   * it was added. `default` keeps the status bar opaque and the web view
   * below it, which is what the safe-area padding elsewhere is measured
   * against; `black-translucent` would put the page under the clock and is a
   * different layout, not a different colour.
   */
  appleWebApp: {
    capable: true,
    title: "Almailgroup",
    statusBarStyle: "default",
  },
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
  /**
   * Lets the page reach the edges of the screen, and — the reason it is here —
   * makes `env(safe-area-inset-*)` report real numbers. Without it every one
   * of them is `0px`, which is why the navigation bar sat on the iPhone's home
   * indicator despite having been padded away from it since the day it was
   * written. Anything that now reaches under the notch or the indicator pads
   * itself back out: the header at the top, the bar and the page at the
   * bottom.
   */
  viewportFit: "cover",
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
      {/*
       * The manifest is asked for with credentials, which is not the default.
       *
       * A manifest is fetched with cookies omitted unless the link says
       * otherwise. Behind Vercel's deployment protection that reads as an
       * anonymous request, so the platform redirects it to vercel.com/sso-api
       * — a different origin, which turns a same-origin fetch into a CORS one
       * that vercel.com refuses. The console filled with CORS failures and the
       * app had no manifest: no name, no icon, nothing to install to a home
       * screen, on exactly the protected URLs the team tests from.
       *
       * Written out here rather than through `metadata.manifest`, which has
       * no way to set the attribute.
       */}
      <link
        rel="manifest"
        href="/manifest.webmanifest"
        crossOrigin="use-credentials"
      />
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
