import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `pointer-coarse` raises every control to a 40px minimum on touch without
  // loosening the desktop density: a 32px icon button is comfortable with a
  // mouse and a poor target for a thumb.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 ease-[var(--ease-spring)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none pointer-coarse:min-h-10",
  {
    variants: {
      variant: {
        /** Inverted fill — the single strongest emphasis in the UI. */
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-primary/90 hover:shadow-[var(--shadow-md)]",
        /** 1px micro-border, the workhorse for most actions. */
        outline:
          "border border-input bg-card hover:border-foreground/40 hover:bg-accent hover:text-accent-foreground hover:shadow-[var(--shadow-xs)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
        /** Reserved for irreversible actions; still greyscale by design. */
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
      },
      size: {
        default: "h-10 px-4 py-2 [&_svg]:size-4",
        sm: "h-9 rounded-lg px-3.5 text-xs [&_svg]:size-3.5",
        lg: "h-11 rounded-xl px-6 [&_svg]:size-4",
        icon: "size-9 pointer-coarse:min-w-10 [&_svg]:size-4",
        "icon-sm": "size-9 rounded-lg pointer-coarse:min-w-10 [&_svg]:size-3.5",
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
