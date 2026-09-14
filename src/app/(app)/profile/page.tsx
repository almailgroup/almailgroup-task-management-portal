import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ChangePassword } from "@/components/profile/change-password";
import { ProfileForm } from "@/components/profile/profile-form";
import { ReminderSettings } from "@/components/profile/reminder-settings";
import { roleMeta } from "@/lib/constants";
import { getI18n } from "@/lib/i18n/server";
import {
  getNotificationPreferences,
  requireProfile,
} from "@/lib/data/queries";
import { configuredChannels } from "@/lib/reminders/providers";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("shell.profile") };
}

export default async function ProfilePage() {
  const { t } = await getI18n();
  const [profile, preferences] = await Promise.all([
    requireProfile(),
    getNotificationPreferences(),
  ]);
  const role = roleMeta(profile.role);

  // Read on the server: which channels actually have credentials. The UI shows
  // the rest disabled with the reason, rather than silently doing nothing.
  const available = configuredChannels();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? null;

  return (
    <PageShell width="narrow">
      <PageHeader
        title={t("shell.profile")}
        icon={<UserCog />}
        description={t("profile.description")}
        actions={
          <>
            {profile.job_title && (
              <Badge variant="secondary">{profile.job_title}</Badge>
            )}
            <Badge variant="outline">{t(role.label)}</Badge>
          </>
        }
      />

      <Card>
        <CardContent className="pt-4">
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("auth.password")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePassword />
        </CardContent>
      </Card>

      {preferences && (
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.reminders")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReminderSettings
              preferences={preferences}
              email={profile.email}
              available={available}
              botUsername={botUsername}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.access")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{t(role.description)}</p>
          <p>
            <span className="font-medium text-foreground">{t("position.label")}:</span>{" "}
            {profile.job_title ?? t("profile.notSet")}
          </p>
          <p>{t("profile.assignedByAdmin")}</p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
