import { AppShell } from "@/components/layout/app-shell";
import { getProjects, requireProfile } from "@/lib/data/queries";

/**
 * Authenticated layout. `requireProfile()` redirects to /login when there is no
 * session, which makes this a second gate behind the middleware.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, projects] = await Promise.all([
    requireProfile(),
    getProjects(),
  ]);

  return (
    <AppShell profile={profile} projects={projects}>
      {children}
    </AppShell>
  );
}
