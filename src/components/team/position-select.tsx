"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { updateMemberPosition } from "@/lib/data/profile-actions";
import { POSITION_PRESETS } from "@/lib/positions";
import { cn } from "@/lib/utils";

/**
 * Admin control for a member's job position.
 *
 * Offers the common positions as a menu and a free-text field for anything
 * else, since every organisation has titles no preset list will cover.
 */
export function PositionSelect({
  userId,
  jobTitle,
}: {
  userId: string;
  jobTitle: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(jobTitle ?? "");
  const [custom, setCustom] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => setValue(jobTitle ?? ""), [jobTitle]);

  async function save(next: string) {
    const previous = value;
    setValue(next);
    setPending(true);

    const outcome = await updateMemberPosition(userId, next);
    setPending(false);

    if (!outcome.ok) {
      setValue(previous); // Roll back to the server's truth.
      toast.error(outcome.error);
      return;
    }

    toast.success(next ? "Position updated" : "Position cleared");
    setEditing(false);
    setCustom("");
    router.refresh();
  }

  if (editing) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save(custom.trim());
        }}
        className="flex items-center gap-1.5"
      >
        <Input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Type a position"
          maxLength={60}
          autoFocus
          className="h-8 w-[11rem] text-xs"
          aria-label="Custom position"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(false);
            setCustom("");
          }}
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          className="w-[11rem] justify-start font-normal"
        >
          {pending && <Loader2 className="animate-spin" />}
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "No position"}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Position</DropdownMenuLabel>

        {POSITION_PRESETS.map((preset) => (
          <DropdownMenuItem key={preset} onSelect={() => save(preset)}>
            <Check
              className={cn("size-4", value === preset ? "opacity-100" : "opacity-0")}
            />
            {preset}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setCustom(value);
            setEditing(true);
          }}
        >
          <Pencil />
          Type a custom position
        </DropdownMenuItem>

        {value && (
          <DropdownMenuItem onSelect={() => save("")}>
            Clear position
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
