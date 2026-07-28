import { expect, type Page, test } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("TimetableAdmin2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("supervisor sees the simplified workflow on desktop", async ({ page }) => {
  await signIn(page);

  await expect(
    page.getByRole("heading", { name: "Timetable overview" }),
  ).toBeVisible();
  const primary = page.getByRole("navigation", { name: "Primary" });
  for (const label of [
    "Overview",
    "School setup",
    "Curriculum",
    "Teachers",
    "Restrictions",
    "Generate",
    "Timetables",
  ]) {
    await expect(primary.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(primary.getByRole("link", { name: "Rooms" })).toHaveCount(0);
  await expect(primary.getByRole("link", { name: "Requirements" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Setup progress" }),
  ).toBeVisible();

  await primary.getByRole("link", { name: "School setup" }).click();
  await expect(
    page.getByRole("heading", { name: "School setup" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to curriculum" }),
  ).toBeVisible();
});

test("supervisor workflow remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const mobile = page.getByRole("navigation", { name: "Mobile primary" });
  await expect(mobile.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(mobile.getByRole("link", { name: "Generate" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Setup progress" }),
  ).toBeVisible();
});
