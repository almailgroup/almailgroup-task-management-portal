"use client";

import * as React from "react";
import { Check, MonitorSmartphone, Palette } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n/client";
import { THEMES, type ThemeOption } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Choosing a theme.
 *
 * This was a light/dark switch. Now it opens a menu: the device's own choice
 * first, then the light themes and the dark ones, each with a swatch drawn
 * from its own colours so the choice is made by eye rather than by name.
 *
 * Each group sits in two columns. One column of fourteen themes is taller
 * than a small iPhone's screen once every row is a full finger's height, and
 * the menu still scrolls if a screen is shorter than that.
 *
 * Renders a stable placeholder until mounted. The stored theme lives in the
 * browser, so the server cannot know it, and drawing a tick next to the wrong
 * one for a frame is a hydration mismatch.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-hidden className="opacity-0" />;
  }

  const active = theme ?? "system";
  const light = THEMES.filter((option) => option.mode === "light");
  const dark = THEMES.filter((option) => option.mode === "dark");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("theme.title")} title={t("theme.title")}>
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[19rem] overflow-y-auto"
      >
        <DropdownMenuItem onSelect={() => setTheme("system")} className="gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-muted [&_svg]:size-3.5">
            <MonitorSmartphone />
          </span>
          <span className="flex-1">{t("theme.system")}</span>
          {active === "system" && <Check className="size-4" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("theme.groupLight")}</DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-0.5">
          {light.map((option) => (
            <ThemeItem
              key={option.id}
              option={option}
              active={active === option.id}
              onSelect={() => setTheme(option.id)}
            />
          ))}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("theme.groupDark")}</DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-0.5">
          {dark.map((option) => (
            <ThemeItem
              key={option.id}
              option={option}
              active={active === option.id}
              onSelect={() => setTheme(option.id)}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeItem({
  option,
  active,
  onSelect,
}: {
  option: ThemeOption;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenuItem onSelect={onSelect} className="gap-2.5">
      <Swatch option={option} />
      <span className="min-w-0 flex-1 truncate">{t(option.label)}</span>
      {active && <Check className="size-4" />}
    </DropdownMenuItem>
  );
}

/**
 * The theme in miniature: its page, a card on it, and its main colour.
 * Drawn from fixed values rather than the live tokens, since every swatch has
 * to show its own theme while the page is wearing a different one.
 */
function Swatch({ option }: { option: ThemeOption }) {
  const { ground, card, accent } = option.swatch;
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-6 shrink-0 items-end justify-end overflow-hidden rounded-full p-[3px]",
        "ring-1 ring-foreground/15 ring-inset",
      )}
      style={{ background: ground }}
    >
      <span
        className="absolute start-[3px] top-[3px] size-3 rounded-full"
        style={{ background: card }}
      />
      <span className="relative size-2.5 rounded-full" style={{ background: accent }} />
    </span>
  );
}
