"use client";

import * as React from "react";
import { CloudOff } from "lucide-react";

import { useI18n } from "@/lib/i18n/client";

/**
 * A line across the top when the connection has gone.
 *
 * Without it the app looks fine and simply stops saving: a task dialog says
 * nothing, a message never arrives, and the only clue is that nothing
 * happens. It is monochrome on purpose — amber in this app means late work,
 * not "something is wrong".
 *
 * `navigator.onLine` is only ever trustworthy when it says false, which is
 * exactly the direction this needs.
 */
export function OfflineBar() {
  const { t } = useI18n();
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-foreground px-3 py-1.5 text-xs font-medium text-background"
      style={{ paddingTop: "calc(0.375rem + var(--safe-top, 0px))" }}
    >
      <CloudOff className="size-3.5" />
      {t("offline.bar")}
    </div>
  );
}
