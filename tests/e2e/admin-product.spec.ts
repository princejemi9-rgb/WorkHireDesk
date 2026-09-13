import { test, expect } from '@playwright/test';
import { createCipheriv, randomBytes } from 'node:crypto';

const id = '11111111-1111-4111-8111-111111111111';

test('authorized application detail displays an audited SSN without browser persistence', async ({ page, context }) => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 9), nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ userId: '22222222-2222-4222-8222-222222222222', accessToken: 'synthetic-access-token', expiresAt: Date.now() + 600000 })), cipher.final()]);
  const value = [nonce, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
  await context.addCookies([{ name: 'whd_admin', value, url: 'http://localhost:4320', httpOnly: true, sameSite: 'Strict' }]);

  await page.goto(`/admin/applications/${id}`);
  await expect(page.getByRole('heading', { name: 'Synthetic Applicant' })).toBeVisible();
  await expect(page.locator('.ssn-value')).toHaveText('123-45-6789');
  await expect(page.getByRole('button', { name: 'Reveal SSN' })).toHaveCount(0);
  await expect(page.getByText('ssn revealed', { exact: false })).toBeVisible();
  await expect(page.getByText(/Validated files are available only/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(4);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

  const documentResponse = await context.request.get(`/api/admin/applications/${id}/documents/idFront`, { maxRedirects: 0 });
  expect(documentResponse.status()).toBe(307);
  expect(documentResponse.headers()['cache-control']).toContain('no-store');
  const detailResponse = await context.request.get(`/admin/applications/${id}`, { maxRedirects: 0 });
  expect(detailResponse.headers()['cache-control']).toContain('no-store');

  await page.getByLabel(/Notifications,/).click();
  await expect(page.locator('.notification-panel')).toContainText('Synthetic Applicant');
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByLabel('Notifications, 0 unread')).toBeVisible();

  await context.clearCookies();
  const unauthenticated = await context.request.get(`/admin/applications/${id}`, { maxRedirects: 0 });
  expect(unauthenticated.status()).toBe(307);
});
