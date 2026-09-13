import { AppShell } from "@/components/layout/app-shell";
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
    <AppShell
      profile={profile}
      projects={projects}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
