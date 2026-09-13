/**
 * Sidebar width constants.
 *
 * Deliberately in a module with no "use client" directive: the authenticated
 * layout is a Server Component and interpolates these into its pre-paint
 * script, and every export of a client module becomes a client reference when
 * the server imports it.
 */
export const SIDEBAR_MIN = 208;
export const SIDEBAR_MAX = 440;
export const SIDEBAR_DEFAULT = 240;
export const SIDEBAR_STORAGE_KEY = "almailgroup:sidebar-width";

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)));
}
