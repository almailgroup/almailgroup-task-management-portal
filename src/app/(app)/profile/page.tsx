import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile/profile-form";
import { roleMeta } from "@/lib/constants";
import { requireProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await requireProfile();
  const role = roleMeta(profile.role);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1>Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How you appear to the rest of the workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {profile.job_title && (
            <Badge variant="secondary">{profile.job_title}</Badge>
          )}
          <Badge variant="outline">{role.label}</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Your access</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{role.description}</p>
          <p>
            <span className="font-medium text-foreground">Position:</span>{" "}
            {profile.job_title ?? "Not set"}
          </p>
          <p>Roles and positions are assigned by an admin.</p>
        </CardContent>
      </Card>
    </div>
  );
}
