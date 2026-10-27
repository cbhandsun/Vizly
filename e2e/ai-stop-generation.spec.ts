import { expect, test } from '@playwright/test';

test('stopping AI generation rejects late canvas commands and allows a new request', async ({ page }) => {
  let releaseLate!: () => void;
  const lateGate = new Promise<void>(resolve => { releaseLate = resolve; });
  let firstRequested!: () => void;
  const requested = new Promise<void>(resolve => { firstRequested = resolve; });
  let firstHandled!: () => void;
  const handled = new Promise<void>(resolve => { firstHandled = resolve; });
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
      } });
      return;
    }
    const first = ++calls === 1;
    if (first) { firstRequested(); await lateGate; }
    const label = first ? 'LATE_AI_STOP_SENTINEL' : 'CURRENT_AI_CONTROL';
    const command = `[COMMAND: ${JSON.stringify({ action: 'addNode', label })}]`;
    try {
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: `data: ${JSON.stringify({ choices: [{ delta: { content: command } }] })}\n\ndata: [DONE]\n\n`,
      });
    } finally { if (first) firstHandled(); }
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-chat-inline-secondary').getByRole('button', { name: '设置', exact: true }).click();
  const config = page.getByRole('dialog', { name: 'AI 平台与模型配置' });
  await config.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await config.getByLabel('API Key', { exact: true }).fill('synthetic-browser-stop-key');
  await config.getByRole('button', { name: '保存全部', exact: true }).click();
  const input = page.getByRole('textbox', { name: '向 AI 助手发送消息', exact: true });
  await input.fill('Create a test node');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: '停止生成', exact: true }).click();
  releaseLate();
  await handled;
  await expect(input).toBeEnabled();
  await input.fill('Create a current node');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'CURRENT_AI_CONTROL' })).toHaveCount(1);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'LATE_AI_STOP_SENTINEL' })).toHaveCount(0);
  expect(calls).toBe(2);
});
