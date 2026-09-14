import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * The team lives in this on their phones, so it should install to a home
 * screen like an app rather than opening as a browser tab with a blank
 * document icon. `standalone` drops the URL bar, which buys back a row of
 * vertical space on a device that has little to spare.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Almailgroup Task Management Portal",
    short_name: "Almailgroup",
    description:
      "Plan, assign and track work across Almailgroup projects — boards, daily lists and reminders.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait-primary",
    // Matches the light and dark page grounds, so the splash screen and the
    // system chrome do not flash a colour the app never uses.
    background_color: "#f3f3f4",
    theme_color: "#111217",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
