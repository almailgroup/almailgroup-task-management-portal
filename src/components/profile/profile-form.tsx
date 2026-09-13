"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AvatarUpload } from "@/components/profile/avatar-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormError } from "@/components/auth/field-error";
import { updateProfile } from "@/lib/data/profile-actions";
import type { ActionResult } from "@/lib/action-result";
import type { Profile } from "@/lib/supabase/database.types";

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<void> | null>(null);
  const [fullName, setFullName] = React.useState(profile.full_name ?? "");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    const outcome = await updateProfile(null, new FormData(event.currentTarget));
    setPending(false);

    if (!outcome.ok) {
      setResult(outcome);
      return;
    }

    toast.success("Profile updated");
    router.refresh();
  }

  const errors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormError message={result?.ok === false ? result.error : null} />

      {/* Preserved so saving the name does not wipe a picture set above. */}
      <input type="hidden" name="avatarUrl" value={profile.avatar_url ?? ""} />

      <AvatarUpload profile={profile} />

      <p className="text-sm text-muted-foreground">
        {profile.email} — your email comes from your sign-in and cannot be
        changed here.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={120}
          required
          aria-invalid={Boolean(errors?.fullName)}
        />
        <FieldError message={errors?.fullName} />
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
