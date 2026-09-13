import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/dashboard/metric-card";
import type { Workload } from "@/lib/metrics";

/** Per-person workload, sized relative to the busiest member. */
export function WorkloadCard({ workload }: { workload: Workload[] }) {
  const busiest = Math.max(1, ...workload.map((entry) => entry.open));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workload</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {workload.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks are assigned yet.
          </p>
        ) : (
          workload.map(({ profile, open, done, overdue }) => (
            <div key={profile.id} className="flex items-center gap-3">
              <Avatar className="size-7">
                {profile.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt="" />
                )}
                <AvatarFallback className="text-[10px]">
                  {initialsFrom(profile.full_name, profile.email)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {profile.full_name ?? profile.email}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {open} open
                    {overdue > 0 && (
                      <span className="ml-1.5 font-medium text-foreground">
                        {overdue} overdue
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar
                    value={(open / busiest) * 100}
                    label={`${profile.full_name ?? profile.email}: ${open} open tasks`}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {done} completed
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
