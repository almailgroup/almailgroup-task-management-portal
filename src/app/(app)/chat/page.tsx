import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { TeamChat } from "@/components/chat/team-chat";
import { getI18n } from "@/lib/i18n/server";
import { getTeam, getTeamMessages, requireProfile } from "@/lib/data/queries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.chat") };
}

export default async function ChatPage() {
  const { t } = await getI18n();
  const [profile, team, messages] = await Promise.all([
    requireProfile(),
    getTeam(),
    getTeamMessages(),
  ]);

  return (
    <PageShell>
      <PageHeader
        title={t("nav.chat")}
        description={t("chat.subtitle")}
        icon={<MessagesSquare />}
      />
      <TeamChat profile={profile} team={team} initial={messages} />
    </PageShell>
  );
}
