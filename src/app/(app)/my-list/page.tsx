import type { Metadata } from "next";

import { MyList } from "@/components/notes/my-list";
import { getMyNotes, requireProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "My List" };

/**
 * A private daily list. Deliberately outside PageShell: the Notes-style
 * master/detail fills the viewport and manages its own scrolling, rather than
 * sitting in the centred column the task pages use.
 */
export default async function MyListPage() {
  const [, notes] = await Promise.all([requireProfile(), getMyNotes()]);

  return <MyList initialNotes={notes} />;
}
