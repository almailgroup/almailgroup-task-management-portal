import type { Metadata } from "next";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { RoleSelect } from "@/components/team/role-select";
import { PositionSelect } from "@/components/team/position-select";
import { Users } from "lucide-react";

import { roleMeta } from "@/lib/constants";
import { getTeam, requireProfile } from "@/lib/data/queries";
import { hasServiceRole } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const [profile, team] = await Promise.all([requireProfile(), getTeam()]);
  const isAdmin = profile.role === "admin";

  return (
    <PageShell width="wide">
      <PageHeader
        title="Team"
        icon={<Users />}
        description={
          <>
            {team.length} {team.length === 1 ? "member" : "members"} in this
            workspace.
            {isAdmin
              ? " As an admin you can add people, and set roles and positions."
              : " Only admins can change roles and positions."}
          </>
        }
        actions={
          isAdmin ? <AddMemberDialog configured={hasServiceRole()} /> : undefined
        }
      />

      <Card className="divide-y divide-border">
        {team.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar>
                {member.avatar_url && (
                  <AvatarImage src={member.avatar_url} alt="" />
                )}
                <AvatarFallback>
                  {initialsFrom(member.full_name, member.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-medium">
                  {member.full_name ?? member.email}
                  {member.id === profile.id && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      you
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
                {!isAdmin && member.job_title && (
                  <p className="truncate text-xs text-muted-foreground">
                    {member.job_title}
                  </p>
                )}
              </div>
            </div>

            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-2">
                <PositionSelect
                  userId={member.id}
                  jobTitle={member.job_title}
                />
                <RoleSelect
                  userId={member.id}
                  role={member.role}
                  /* Guard against an admin removing their own last admin rights. */
                  disabled={member.id === profile.id}
                />
              </div>
            ) : (
              <Badge variant="outline">{roleMeta(member.role).label}</Badge>
            )}
          </div>
        ))}
      </Card>
    </PageShell>
  );
}
