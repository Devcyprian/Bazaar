import { test, expect } from '@playwright/test';
import { enableMockContract } from './fixtures';

test.describe('Landing page', () => {
  // Injecting the mock client is harmless on the landing page (it never calls
  // the contract) and ensures the marketplace renders cleanly once the CTA
  // navigates there.
  test.beforeEach(async ({ page }) => {
    await enableMockContract(page);
  });

  test('loads and renders the hero section', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /Decentralized/i }),
    ).toBeVisible();
  });

  test('hero CTA "Browse AI Agents" navigates to /marketplace', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /Browse AI Agents/ }).click();

    await expect(page).toHaveURL(/\/marketplace/);
  });

  test('page title is set', async ({ page }) => {
    await page.goto('/');

    // The tab title should be non-empty (set by the app)
    await expect(page).toHaveTitle(/.+/);
  });

  test('landing -> marketplace -> job detail smoke flow', async ({ page }) => {
    await page.goto('/');

    // Navigate from the hero CTA to the marketplace.
    await page.getByRole('link', { name: /Browse AI Agents/ }).click();
    await expect(page).toHaveURL(/\/marketplace/);

    // Wait for the mocked contract data to render a job card.
    const jobCard = page.getByRole('link', { name: /View job/i }).first();
    await expect(jobCard).toBeVisible();

    // Capture the job title from the card so we can assert it on the detail page.
    const jobTitle = (await jobCard.textContent())?.trim() ?? '';
    expect(jobTitle.length).toBeGreaterThan(0);

    // Open the job detail page.
    await jobCard.click();
    await expect(page).toHaveURL(/\/marketplace\/.+/);

    // The job title should render on the detail page.
    await expect(
      page.getByRole('heading', { name: new RegExp(escapeRegExp(jobTitle)) }),
    ).toBeVisible();
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}