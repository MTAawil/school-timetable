import { expect, test } from "@playwright/test";

test("administrator can sign in and add a teacher", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Administrator sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("TimetableAdmin2026!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/teachers");

  const suffix = Date.now().toString().slice(-7);
  await page.getByPlaceholder("Full name").fill(`Setup Test ${suffix}`);
  await page.getByPlaceholder("Code").fill(`T${suffix}`);
  await page.getByRole("button", { name: "Save teacher" }).click();

  await expect(page.getByText(`Setup Test ${suffix}`)).toBeVisible();

  await page.goto("/readiness");
  await expect(
    page.getByRole("heading", { name: "Generation readiness" }),
  ).toBeVisible();
  await expect(page.getByText(/^[a-f0-9]{64}$/)).toBeVisible();

  await page.getByRole("button", { name: "Generate timetable" }).click();
  await expect(
    page.getByRole("heading", { name: "Generation result" }),
  ).toBeVisible();
  await expect(page.getByText(/lessons assigned/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quality score" }),
  ).toBeVisible();
  await expect(page.getByText("Alternative 3", { exact: true })).toBeVisible();
  await page.getByText("Alternative 2", { exact: true }).click();
  await expect(page).toHaveURL(/alternative=2/);

  await page.getByRole("button", { name: "Open as draft" }).click();
  await expect(page).toHaveURL(/\/schedules\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("heading", { name: /Generated alternative 2.*v\d+/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Teacher", exact: true }).click();
  await expect(page.getByLabel("teacher filter")).toBeVisible();
  await page.getByRole("link", { name: "Whole school" }).click();

  const teacherRows = page
    .locator('[id^="assignment-"]')
    .filter({ hasText: "Maya Haddad" });
  const firstRow = teacherRows.nth(0);
  const secondRow = teacherRows.nth(1);
  await expect(secondRow).toBeVisible();
  const collisionDay = await secondRow.getByLabel("Move day").inputValue();
  const collisionPeriod = await secondRow
    .getByLabel("Move period")
    .inputValue();
  const unchangedUrl = page.url();
  await firstRow.getByLabel("Move day").selectOption(collisionDay);
  await firstRow.getByLabel("Move period").selectOption(collisionPeriod);
  await firstRow.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page).toHaveURL(/error=COLLISION/, { timeout: 10_000 });
  await expect(page.locator('div[role="alert"]')).toContainText("COLLISION:");
  expect(page.url().split("?")[0]).toBe(unchangedUrl.split("?")[0]);

  await page.getByTitle("Lock", { exact: true }).first().click();
  await expect(page.getByRole("link", { name: "Undo" })).toBeVisible();
  await page.getByRole("link", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: "Redo" })).toBeVisible();
  await page.getByRole("link", { name: "Redo" }).click();

  let previousScheduleUrl = page.url();
  await page.getByTitle("Lock", { exact: true }).first().click();
  await page.waitForURL((url) => url.toString() !== previousScheduleUrl);
  previousScheduleUrl = page.url();
  await page.getByTitle("Lock", { exact: true }).first().click();
  await page.waitForURL((url) => url.toString() !== previousScheduleUrl);
  await expect(page.getByTitle("Unlock")).toHaveCount(3);

  await page.getByRole("button", { name: "Regenerate unlocked" }).click();
  await expect(page).toHaveURL(/regenerated=1/, { timeout: 45_000 });
  await expect(
    page.getByText(/3 locked assignments remained fixed/),
  ).toBeVisible();
  await expect(page.getByTitle("Unlock")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Undo" })).toBeVisible();
});
