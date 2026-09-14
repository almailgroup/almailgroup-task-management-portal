import { expect, test } from "@playwright/test";

const PAGES = ["/", "/login", "/register"];

for (const path of PAGES) {
  test.describe(path, () => {
    test("renders without a page error", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      expect(errors, `page errors on ${path}`).toEqual([]);
    });

    /**
     * The rule that keeps being broken by accident: a fixed-width element or a
     * row that will not wrap makes the whole page pan sideways on a phone.
     * Cheap to check, and it has caught real regressions here.
     */
    test("never scrolls sideways", async ({ page }) => {
      await page.goto(path);
      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${path} scrolls horizontally`).toBe(false);
    });

    test("every control is big enough to tap", async ({ page, isMobile }) => {
      test.skip(!isMobile, "Touch sizing only applies to a coarse pointer.");
      await page.goto(path);

      const tooSmall = await page.evaluate(() =>
        [...document.querySelectorAll("button, a, input, select, textarea")]
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && rect.height > 0)
          .filter(({ rect }) => rect.height < 36 || rect.width < 32)
          .map(({ el, rect }) =>
            `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
          ),
      );
      expect(tooSmall).toEqual([]);
    });
  });
}

test("a signed-out visitor is sent to sign in, keeping their destination", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard");
});

test("the sign-in page offers a route to sign up, and back", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create one" }).click();
  await page.waitForURL(/\/register/);
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL(/\/login/);
});
