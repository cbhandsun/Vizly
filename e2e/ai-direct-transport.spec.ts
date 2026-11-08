import { expect, test, type Page } from '@playwright/test';

async function openProvider(page: Page) {
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-chat-inline-secondary').getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 平台与模型配置' });
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  return dialog;
}

test('browser-direct transport is opt-in and persists without credentials', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  let dialog = await openProvider(page);
  const toggle = dialog.getByRole('switch', { name: '浏览器直连' });
  await expect(toggle).not.toBeChecked();
  await dialog.getByLabel('API Key', { exact: true }).fill('synthetic-direct-transport-key');
  await toggle.click();
  await dialog.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('synthetic-direct-transport-key');
  await page.reload();
  dialog = await openProvider(page);
  await expect(dialog.getByRole('switch', { name: '浏览器直连' })).toBeChecked();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  let requests = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      return;
    }
    requests += 1;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'data: {"choices":[{"delta":{"content":"DIRECT_TEST_OK"}}]}\n\ndata: [DONE]\n\n' });
  });
  await dialog.getByLabel('API Key', { exact: true }).fill('synthetic-direct-transport-key');
  await dialog.getByRole('button', { name: '保存全部', exact: true }).click();
  await page.getByRole('textbox', { name: '向 AI 助手发送消息', exact: true }).fill('Reply with a short confirmation.');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByText('DIRECT_TEST_OK')).toBeVisible();
  expect(requests).toBe(1);
});
