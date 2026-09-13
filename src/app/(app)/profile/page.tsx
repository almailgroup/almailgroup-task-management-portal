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
        <Badge variant="outline">{role.label}</Badge>
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
        <CardContent className="text-sm text-muted-foreground">
          {role.description} Only an admin can change roles.
        </CardContent>
      </Card>
    </div>
  );
}
