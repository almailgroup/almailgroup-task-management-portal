import { expect, test } from "@playwright/test";

import { openDialog, PEOPLE, signIn } from "./helpers";

/**
 * The palette is the fastest way through the portal, so it has to know about
 * all of it. Every destination added to the sidebar since belongs here too,
 * which is the kind of thing that quietly stops being true.
 */
test.describe("the command palette", () => {
  test("knows every place the sidebar does", async ({ page }) => {
    await signIn(page);
    await page.keyboard.press("ControlOrMeta+k");
    const palette = await openDialog(page);

    for (const destination of [
      "Today",
      "Calendar",
      "My List",
      "General tasks",
      "Team",
      "Team chat",
      "Messages",
    ]) {
      await palette.getByRole("textbox").fill(destination);
      await expect(
        palette.getByRole("listitem").filter({ hasText: destination }).first(),
      ).toBeVisible();
    }
  });

  test("finds a person, and opens the thread with them", async ({ page }) => {
    await signIn(page);
    await page.keyboard.press("ControlOrMeta+k");
    const palette = await openDialog(page);

    await palette.getByRole("textbox").fill("priya");
    const person = palette.getByRole("listitem").filter({ hasText: "Priya Nair" }).first();
    await expect(person).toBeVisible({ timeout: 10_000 });
    await expect(palette).toContainText("People");

    await person.click();
    await page.waitForURL(/\/messages\/[0-9a-f-]+/, { timeout: 15_000 });
    // The visible copy: on a phone the conversation list is still in the
    // page behind the thread, name and all.
    await expect(
      page.getByText("Priya Nair").filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("does not offer to message yourself", async ({ page }) => {
    await signIn(page, PEOPLE.manager);
    await page.keyboard.press("ControlOrMeta+k");
    const palette = await openDialog(page);

    await palette.getByRole("textbox").fill("Sara");
    await expect(
      palette.getByRole("listitem").filter({ hasText: "Sara Khan" }),
    ).toHaveCount(0);
  });
});
