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
    "Generate",
    "Timetables",
  ]) {
    await expect(primary.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(primary.getByRole("link", { name: "Rooms" })).toHaveCount(0);
  await expect(primary.getByRole("link", { name: "Requirements" })).toHaveCount(
    0,
  );
  await expect(primary.getByRole("link", { name: "Restrictions" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Setup progress" }),
  ).toBeVisible();

  await primary.getByRole("link", { name: "Teachers" }).click();
  await page.getByRole("link", { name: "Edit Maya Haddad" }).click();
  await expect(
    page.getByText("Declared and allocated sessions match."),
  ).toBeVisible();
  const restrictionCell = page.getByRole("button", {
    name: /Monday, Period 1:/,
  });
  const initialRestriction = await restrictionCell.getAttribute("aria-label");
  await restrictionCell.click();
  await expect(restrictionCell).not.toHaveAttribute(
    "aria-label",
    initialRestriction ?? "",
  );
  await page.getByRole("button", { name: "Save teacher" }).click();
  await expect(page).toHaveURL(/\/teachers\?teacher=[a-f0-9-]+&saved=teacher/);
  await expect(
    page.getByText(
      "Teacher details, classes, subjects, and restrictions saved.",
    ),
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
