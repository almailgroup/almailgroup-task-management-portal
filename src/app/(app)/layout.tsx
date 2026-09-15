import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { TimeZoneCookie } from "@/components/layout/timezone-cookie";
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_STORAGE_KEY,
} from "@/lib/sidebar";
import {
  getNotifications,
  getProjects,
  getUnreadNotificationCount,
  needsOwnPassword,
  requireProfile,
} from "@/lib/data/queries";

/**
 * Authenticated layout. `requireProfile()` redirects to /login when there is no
 * session, which makes this a second gate behind the middleware.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // All five together, not the password check and then the rest. Only the
  // profile actually depends on knowing who is asking; the other three are
  // scoped by row-level security and could always have been on their way
  // while the question was being answered. Awaiting the check on its own put
  // a whole round trip in front of them for nothing.
  const [mustChangePassword, profile, projects, notifications, unreadCount] =
    await Promise.all([
      needsOwnPassword(),
      requireProfile(),
      getProjects(),
      getNotifications(),
      getUnreadNotificationCount(),
    ]);

  // Nobody works out of an account whose password was handed to them. The
  // page this leads to is outside this layout, so there is nothing to loop on.
  if (mustChangePassword) redirect("/set-password");

  return (
    <>
      {/*
       * Apply the stored sidebar width before first paint. Without this the
       * rail renders at the default and visibly snaps once React hydrates —
       * the same problem, and the same fix, as a theme flash.
       */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var w=localStorage.getItem('${SIDEBAR_STORAGE_KEY}');if(w){var n=Math.min(${SIDEBAR_MAX},Math.max(${SIDEBAR_MIN},parseInt(w,10)||${SIDEBAR_DEFAULT}));document.documentElement.style.setProperty('--sidebar-width',n+'px');}}catch(e){}})();`,
        }}
      />
      <TimeZoneCookie />

      <AppShell
        profile={profile}
        projects={projects}
        notifications={notifications}
        unreadCount={unreadCount}
      >
        {children}
      </AppShell>
    </>
  );
}
