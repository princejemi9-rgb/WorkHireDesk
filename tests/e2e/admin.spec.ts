import { test, expect } from '@playwright/test';

test('staff pages are guarded and recovery is discoverable and responsive', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/admin\/forgot-password$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/admin/account');
  await expect(page).toHaveURL(/\/admin\/login$/);
  const download = await request.get('/api/admin/applications/11111111-1111-4111-8111-111111111111/documents/resume');
  expect(download.status()).toBe(404);
  await page.goto('/admin/reset-password');
  await expect(page.getByRole('button', { name: 'Update password' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('email callback removes tokens from URL and checks confirmation with the server', async ({ page }) => {
  await page.route('**/api/admin/verification/confirm', route => route.fulfill({ status: 204 }));
  await page.goto('/admin/verify-email#access_token=synthetic-token&type=signup');
  await expect(page).toHaveURL(/\/admin\/verify-email$/);
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.getByRole('link', { name: 'Return to sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('recovery preserves the token in memory after scrubbing the fragment', async ({ page }) => {
  await page.route('**/api/admin/reset-password', async route => {
    expect(route.request().postDataJSON().token).toBe('synthetic-recovery-token');
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/admin/reset-password#type=recovery&access_token=synthetic-recovery-token');
  await expect(page).toHaveURL(/\/admin\/reset-password$/);
  await page.getByLabel('New password', { exact: true }).fill('Synthetic-Password123!');
  await page.getByLabel('Confirm new password').fill('Synthetic-Password123!');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
