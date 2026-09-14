import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `pointer-coarse` raises every control to a 40px minimum on touch without
  // loosening the desktop density: a 32px icon button is comfortable with a
  // mouse and a poor target for a thumb.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none pointer-coarse:min-h-10",
  {
    variants: {
      variant: {
        /** Inverted fill — the single strongest emphasis in the UI. */
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--shadow-xs)]",
        /** 1px micro-border, the workhorse for most actions. */
        outline:
          "border border-input bg-card hover:border-foreground/25 hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
        /** Reserved for irreversible actions; still greyscale by design. */
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
      },
      size: {
        default: "h-9 px-4 py-2 [&_svg]:size-4",
        sm: "h-8 rounded-md px-3 text-xs [&_svg]:size-3.5",
        lg: "h-10 rounded-md px-6 [&_svg]:size-4",
        icon: "size-9 pointer-coarse:min-w-10 [&_svg]:size-4",
        "icon-sm": "size-8 rounded-md pointer-coarse:min-w-10 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
