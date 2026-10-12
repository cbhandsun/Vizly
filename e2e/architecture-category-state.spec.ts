import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test('architecture category stays collapsed when a component is added', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/?diagram=enterprise-architecture-v2');
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(52);
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();
  await page.getByRole('button', { name: '架构组件库', exact: true }).click();
  const category = page.locator('button[aria-controls="architecture-category-network"]');
  await category.click();
  await expect(category).toHaveAttribute('aria-expanded', 'false');
  const originalButton = await category.elementHandle();
  expect(originalButton).not.toBeNull();
  await page.locator('#architecture-category-compute button[draggable]').first().click();
  await expect(nodes).toHaveCount(53);
  await expect(category).toHaveAttribute('aria-expanded', 'false');
  expect(await originalButton!.evaluate(button => button.isConnected)).toBe(true);
});
