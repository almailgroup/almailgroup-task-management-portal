import { expect, test } from "@playwright/test";

import { openDialog, PEOPLE, signIn, taskNamed, unique } from "./helpers";

/**
 * The steps inside a task.
 *
 * Who may change them is decided by row-level security and checked against a
 * real Postgres in supabase/tests/task-checklists.sql. These check that the
 * panel does what it looks like it does.
 */
test.describe("a task's steps", () => {
  test("are listed, ticked and counted", async ({ page }) => {
    await signIn(page);
    await page.goto("/tasks?filter=all");

    await taskNamed(page, "Meet with Kuwait banks").click();
    const dialog = await openDialog(page);

    await expect(dialog.getByText("Bring the signatory list")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText("1 of 2")).toBeVisible();

    // Tick the second one; the count follows.
    await dialog.getByRole("checkbox", { name: "Bring the trade licence" }).click();
    await expect(dialog.getByText("2 of 2")).toBeVisible({ timeout: 15_000 });
  });

  test("can be added, and survive a reload", async ({ page }) => {
    const step = unique("Bring the stamp");

    await signIn(page);
    await page.goto("/tasks?filter=all");
    await taskNamed(page, "Meet with Kuwait banks").click();
    const dialog = await openDialog(page);
    await expect(dialog.getByText("Bring the signatory list")).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole("textbox", { name: "Add a step…" }).fill(step);
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(dialog.getByText(step)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await taskNamed(page, "Meet with Kuwait banks").click();
    const again = await openDialog(page);
    await expect(again.getByText(step)).toBeVisible({ timeout: 15_000 });
  });

  test("a member sees them and can tick, but not add", async ({ page }) => {
    await signIn(page, PEOPLE.member);
    await page.goto("/tasks?filter=all");

    await taskNamed(page, "Draft the September invoice").click();
    const dialog = await openDialog(page);

    // The progress view, not the editor.
    await expect(dialog.locator("#member-status")).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole("textbox", { name: "Add a step…" })).toHaveCount(0);
  });
});
