import type { Metadata } from "next";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RoleSelect } from "@/components/team/role-select";
import { roleMeta } from "@/lib/constants";
import { getTeam, requireProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const [profile, team] = await Promise.all([requireProfile(), getTeam()]);
  const isAdmin = profile.role === "admin";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1>Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {team.length} {team.length === 1 ? "member" : "members"} in this
          workspace.
          {isAdmin
            ? " As an admin you can change roles."
            : " Only admins can change roles."}
        </p>
      </div>

      <Card className="divide-y divide-border">
        {team.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 p-3"
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
                <p className="truncate text-sm font-medium">
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
              </div>
            </div>

            {isAdmin ? (
              <RoleSelect
                userId={member.id}
                role={member.role}
                /* Guard against an admin removing their own last admin rights. */
                disabled={member.id === profile.id}
              />
            ) : (
              <Badge variant="outline">{roleMeta(member.role).label}</Badge>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
