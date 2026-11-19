import { test, expect } from '@playwright/test';
import { mockFreighter } from './fixtures';

/**
 * These routes gate on a connected Freighter wallet. By default the e2e
 * browser has no Freighter extension, so `useWallet().isConnected` stays false
 * and the connect-gate UI renders. Tests that need the connected state install
 * the mocked Freighter helper from `e2e/fixtures` before navigating.
 */
test.describe('Wallet-gated routes', () => {
  test('navigating to /create-job without a wallet shows the Connect Wallet Required gate', async ({
    page,
  }) => {
    await page.goto('/create-job');

    await expect(
      page.getByRole('heading', { name: 'Connect Wallet Required' }),
    ).toBeVisible();
    await expect(
      page.getByText('You need to connect your Stellar wallet to post a job.'),
    ).toBeVisible();
  });

  test('navigating to /dashboard without a wallet shows a connect prompt', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await expect(
      page.getByText('Connect your Freighter wallet to access your dashboard'),
    ).toBeVisible();
  });

  test('navigating to /register-agent without a wallet shows a connect gate', async ({
    page,
  }) => {
    await page.goto('/register-agent');

    // The register-agent page also gates on wallet connection
    await expect(
      page.getByRole('heading', { name: 'Connect Wallet Required' }),
    ).toBeVisible();
  });

  test('/create-job gate has a Go to Marketplace fallback button', async ({
    page,
  }) => {
    await page.goto('/create-job');

    const fallback = page.getByRole('button', { name: /Go to Marketplace/i });
    await expect(fallback).toBeVisible();

    await fallback.click();
    await expect(page).toHaveURL(/\/marketplace/);
  });

  test('/create-job renders the job form when a wallet is connected', async ({
    page,
  }) => {
    await mockFreighter(page, { connected: true });
    await page.goto('/create-job');

    await expect(
      page.getByRole('heading', { name: 'Connect Wallet Required' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Post a Job/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/title/i)).toBeVisible();
  });

  test('/register-agent renders the registration form when a wallet is connected', async ({
    page,
  }) => {
    await mockFreighter(page, { connected: true });
    await page.goto('/register-agent');

    await expect(
      page.getByRole('heading', { name: 'Connect Wallet Required' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Register/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/name/i)).toBeVisible();
  });
});
