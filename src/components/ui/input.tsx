import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-xl border border-input bg-card px-3.5 py-1 text-sm transition-[border-color,box-shadow] pointer-coarse:min-h-11",
        "placeholder:text-muted-foreground",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:border-foreground focus-visible:shadow-[var(--shadow-xs)]",
        "aria-invalid:border-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
