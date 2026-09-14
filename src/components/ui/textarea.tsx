import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[72px] w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm transition-[border-color,box-shadow]",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:border-foreground focus-visible:shadow-[var(--shadow-xs)]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
