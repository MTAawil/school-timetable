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
  await expect(page.getByLabel("Name")).toHaveValue("Maya Haddad");
  await expect(
    page.getByText("Declared and allocated sessions match."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Teacher coverage by subject" }),
  ).toBeVisible();
  const allocatedWorkload = page
    .getByRole("region", { name: "Subjects and classes" })
    .getByText("Allocated", { exact: true })
    .locator("..");
  await expect(allocatedWorkload).toContainText("8");
  const restrictionCell = page.getByRole("button", {
    name: /Monday, Period 1:/,
  });
  const initialRestriction = await restrictionCell.getAttribute("aria-label");
  await restrictionCell.click();
  await expect(restrictionCell).not.toHaveAttribute(
    "aria-label",
    initialRestriction ?? "",
  );
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Maya Haddad");
  await page.getByRole("button", { name: "Save teacher" }).click();
  await expect(page).toHaveURL(/\/teachers\?teacher=[a-f0-9-]+&saved=teacher/);
  await expect(
    page.getByText(
      "Teacher details, classes, subjects, and restrictions saved.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Subject filter")
    .selectOption({ label: "English (ENG)" });
  await expect(allocatedWorkload).toContainText("8");
  await expect(
    page.getByRole("checkbox", { name: /English/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Reassign from Nour Saad/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Mathematics/ })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Add teacher" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByLabel("Code")).toHaveValue("");
  await expect(page.getByLabel("Subject filter")).toHaveValue("");
  const subjectEditor = page.getByRole("region", {
    name: "Subjects and classes",
  });
  await expect(
    subjectEditor.getByText("Allocated", { exact: true }).locator(".."),
  ).toContainText("0");

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
