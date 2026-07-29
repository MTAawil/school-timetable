import { expect, test } from "@playwright/test";

test("administrator can complete the timetable workflow", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Administrator sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("TimetableAdmin2026!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "Timetable overview" }),
  ).toBeVisible();
  await page.goto("/teachers");

  await expect(page.getByText("3 / 3")).toBeVisible();
  await expect(page.getByText("Uncovered").locator("..")).toContainText("0");

  await page.goto("/readiness");
  await expect(
    page.getByRole("heading", { name: "Generation readiness" }),
  ).toBeVisible();
  await expect(page.getByText(/^[a-f0-9]{64}$/)).toBeVisible();

  await page.getByRole("button", { name: "Generate timetable" }).click();
  await expect(
    page.getByRole("heading", { name: "Generation result" }),
  ).toBeVisible({ timeout: 45_000 });
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
  await expect(
    page.getByRole("alert").filter({ hasText: "Edit rejected" }),
  ).toContainText("COLLISION:");
  expect(page.url().split("?")[0]).toBe(unchangedUrl.split("?")[0]);
  await page.goto(unchangedUrl.split("?")[0]!);
  await expect(
    page.getByRole("heading", { name: /Generated alternative 2.*v\d+/ }),
  ).toBeVisible();

  let currentScheduleUrl = page.url();
  await Promise.all([
    page.waitForURL((url) => url.toString() !== currentScheduleUrl, {
      timeout: 15_000,
    }),
    page.getByTitle("Lock", { exact: true }).first().click(),
  ]);
  const undoLink = page.getByRole("link", { name: "Undo" });
  await expect(undoLink).toBeVisible();
  const undoHref = await undoLink.getAttribute("href");
  expect(undoHref).toBeTruthy();
  await page.goto(undoHref!);
  const redoLink = page.getByRole("link", { name: "Redo" });
  await expect(redoLink).toBeVisible();
  const redoHref = await redoLink.getAttribute("href");
  expect(redoHref).toBeTruthy();
  await page.goto(redoHref!);

  let previousScheduleUrl = page.url();
  await Promise.all([
    page.waitForURL((url) => url.toString() !== previousScheduleUrl, {
      timeout: 15_000,
    }),
    page.getByTitle("Lock", { exact: true }).first().click(),
  ]);
  previousScheduleUrl = page.url();
  await Promise.all([
    page.waitForURL((url) => url.toString() !== previousScheduleUrl, {
      timeout: 15_000,
    }),
    page.getByTitle("Lock", { exact: true }).first().click(),
  ]);
  await expect(page.getByTitle("Unlock")).toHaveCount(3);

  await page.getByRole("button", { name: "Regenerate unlocked" }).click();
  await expect(page).toHaveURL(/regenerated=1/, { timeout: 45_000 });
  await expect(
    page.getByText(/3 locked assignments remained fixed/),
  ).toBeVisible();
  await expect(page.getByTitle("Unlock")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Undo" })).toBeVisible();

  await page.getByRole("link", { name: "Teacher", exact: true }).click();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^schedule-v\d+\.csv$/);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/published=1/, { timeout: 15_000 });
  await expect(page.getByText(/is now published and immutable/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Regenerate unlocked" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);

  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByText("SCHEDULE PUBLISHED").first()).toBeVisible();
});
