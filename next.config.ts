import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    /**
     * How long a prefetched page stays usable.
     *
     * At the default of 0 a dynamic route is refetched the moment it is
     * clicked, which throws away the prefetch entirely: the rail fetched the
     * page while you were reading, then fetched it again when you asked for
     * it. Twenty seconds is about the gap between a link coming on screen and
     * somebody clicking it, so the work gets used.
     *
     * The cost is staleness, and it is bounded in three ways. Any mutation in
     * this app calls `router.refresh()`, which clears the whole router cache,
     * so nothing you did yourself is ever stale. The task boards subscribe to
     * Postgres changes, so somebody else's edit lands there live. What is left
     * is a page somebody else changed in the last twenty seconds that you
     * navigated to without touching anything — visible for one paint, then
     * corrected.
     */
    staleTimes: { dynamic: 20, static: 180 },
  },

  images: {
    // Supabase Storage serves profile avatars from the project domain.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
