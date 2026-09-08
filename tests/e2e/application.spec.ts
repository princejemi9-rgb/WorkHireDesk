import { test, expect } from "@playwright/test";

const pdf = { name: "synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% synthetic test fixture\n%%EOF") };
test("validates, preserves both steps, handles a server error, and clears sensitive state on success", async ({ page }) => {
  await page.goto("/apply");
  await page.getByRole("button", { name: "Continue to Employment Information" }).click();
  await expect(page.getByText("First name is required.")).toBeVisible();
  await page.getByLabel("First Name", { exact: false }).fill("Synthetic");
  await page.getByLabel("Last Name", { exact: false }).fill("Applicant");
  await page.getByLabel("Date of Birth").fill("1990-01-15");
  await page.getByLabel("Phone Number").fill("2025550123");
  await page.getByLabel("Email Address").fill("test@example.com");
  await page.getByLabel("Residential Address").fill("Synthetic test address");
  await page.getByLabel("Social Security Number").fill("123456789");
  await expect(page.getByLabel("Social Security Number")).toHaveAttribute("type", "password");
  await page.locator("#idFront").setInputFiles(pdf);
  await page.locator("#idBack").setInputFiles(pdf);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Continue to Employment Information" }).click();
  await expect(page).toHaveURL(/\/apply\/employment$/);
  await page.getByLabel("Position Desired").fill("Test Engineer");
  await page.getByLabel("Previous Employer").fill("N/A");
  await page.getByRole("button", { name: "Back to Personal Information" }).click();
  await expect(page.getByLabel("First Name", { exact: false })).toHaveValue("Synthetic");
  await expect(page.getByLabel("Social Security Number")).toHaveValue("123-45-6789");
  await expect(page.getByText("synthetic.pdf")).toHaveCount(2);
  await page.getByRole("button", { name: "Continue to Employment Information" }).click();
  await expect(page.getByLabel("Position Desired")).toHaveValue("Test Engineer");
  await page.locator("#resume").setInputFiles(pdf);
  let requests = 0;
  await page.route("**/api/applications", async route => {
    requests++;
    if (requests === 1) await route.fulfill({ status: 503, json: { message: "Generic error" } });
    else { await new Promise(resolve => setTimeout(resolve, 200)); await route.fulfill({ json: { reference: "WHD-1234ABCD" } }); }
  });
  await page.getByRole("button", { name: "Submit Application", exact: true }).click();
  await expect(page.locator(".submission-error[role=alert]")).toContainText("We couldn't submit your application.");
  await page.getByRole("button", { name: "Submit Application", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submitting application" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Application Submitted" })).toBeVisible();
  await expect(page.getByText("WHD-1234ABCD")).toBeVisible();
  await expect(page.getByText("synthetic.pdf")).toHaveCount(0);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await page.goto("/apply");
  await expect(page.getByLabel("Social Security Number")).toHaveValue("");
});

test("responsive layout and route guards", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/apply/employment");
  await expect(page).toHaveURL(/\/apply$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator(".privacy-notice")).toContainText("We do not sell your SSN");
  await page.goto("/apply/success");
  await expect(page.getByRole("heading", { name: "Application Submitted" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
