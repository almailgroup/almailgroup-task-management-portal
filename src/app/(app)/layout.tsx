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
  const [profile, projects, notifications, unreadCount] = await Promise.all([
    requireProfile(),
    getProjects(),
    getNotifications(),
    getUnreadNotificationCount(),
  ]);

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
