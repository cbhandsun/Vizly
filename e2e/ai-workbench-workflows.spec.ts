import { expect, test, type Page } from '@playwright/test';

const input = (page: Page) => page.getByRole('textbox', { name: '向 AI 助手发送消息', exact: true });
const send = (page: Page) => page.getByRole('button', { name: '发送消息', exact: true });
const reply = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

async function openChat(page: Page, diagramId = 'wms-process-flow-v1') {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto(diagramId === 'wms-process-flow-v1'
    ? '/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1'
    : `/#/?diagram=${diagramId}`);
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
}
async function configure(page: Page) {
  await page.locator('.ai-chat-inline-secondary').getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 平台与模型配置' });
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await dialog.getByLabel('API Key', { exact: true }).fill('synthetic-workbench-key');
  await dialog.getByRole('button', { name: '保存全部', exact: true }).click();
}
async function submit(page: Page, text: string) {
  await input(page).fill(text);
  await send(page).click();
}

test('local canvas commands work without model credentials on desktop and mobile', async ({ page }) => {
  await openChat(page);
  await submit(page, '  /add WORKBENCH_LOCAL_A');
  const node = page.locator('.react-flow__node').filter({ hasText: 'WORKBENCH_LOCAL_A' });
  await expect(node).toHaveCount(1);
  await submit(page, '/add WORKBENCH_LOCAL_B');
  await expect(page.locator('.react-flow__node').filter({ hasText: 'WORKBENCH_LOCAL_B' })).toHaveCount(1);
  const beforeEdges = await page.locator('.react-flow__edge').count();
  await submit(page, '/connect WORKBENCH_LOCAL_A -> WORKBENCH_LOCAL_B');
  await expect(page.locator('.react-flow__edge')).toHaveCount(beforeEdges + 1);
  await submit(page, '/delete WORKBENCH_LOCAL_A');
  await expect(node).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(beforeEdges);
  await page.setViewportSize({ width: 390, height: 844 });
  if (!await input(page).isVisible()) await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await submit(page, '/add WORKBENCH_MOBILE');
  await expect(page.locator('.react-flow__node').filter({ hasText: 'WORKBENCH_MOBILE' })).toHaveCount(1);
  await submit(page, '/help');
  await expect(page.locator('.ai-chat-message.assistant').last()).toContainText('/analyze');
  await expect(page.getByRole('dialog', { name: 'AI 平台与模型配置' })).not.toBeVisible();
});

test('AI shortcuts make one real request and one user turn each, with edge IDs in context', async ({ page }) => {
  const bodies: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', headers, body: reply(`SHORTCUT_OK_${bodies.length}`) });
  });
  await openChat(page);
  await configure(page);
  for (const command of ['/animate', '/flow', '/style', '/analyze', '/suggest', '/doc']) {
    await submit(page, command);
    await expect(page.getByText(`SHORTCUT_OK_${['/animate', '/flow', '/style', '/analyze', '/suggest', '/doc'].indexOf(command) + 1}`, { exact: true })).toBeVisible();
    await expect(page.locator('.ai-chat-message.user').filter({ hasText: command })).toHaveCount(1);
  }
  expect(bodies).toHaveLength(6);
  expect(bodies[0]).toContain('animatePath');
  expect(bodies[0]).toContain('[当前画布状态]');
  expect(bodies[0]).toMatch(/: .*→/s);
  expect(bodies[1]).toContain('animatePath');
  expect(bodies[2]).toContain('updateTheme');
  expect(bodies[3]).toContain('实时图表巡检报告');
});

test('a failed provider request releases the composer and a retry can update the canvas', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls += 1;
    await route.fulfill(calls === 1
      ? { status: 503, contentType: 'application/json', headers, body: '{"error":{"message":"temporary failure"}}' }
      : { status: 200, contentType: 'text/event-stream', headers, body: reply('[COMMAND: {"action":"addNode","label":"WORKBENCH_RETRY_OK"}]') });
  });
  await openChat(page);
  await configure(page);
  await submit(page, 'First request');
  await expect(input(page)).toBeEnabled();
  await expect(page.locator('.ai-chat-message.assistant').last()).toContainText(/503|失败|错误/);
  await submit(page, 'Retry request');
  await expect(page.locator('.react-flow__node').filter({ hasText: 'WORKBENCH_RETRY_OK' })).toHaveCount(1);
  expect(calls).toBe(2);
});

test('history can be renamed, reopened after reload, and deleted', async ({ page }) => {
  await openChat(page);
  await submit(page, '/help');
  await page.locator('.ai-chat-inline-header').getByRole('button', { name: /历史/ }).click();
  const history = page.getByRole('dialog', { name: /历史/ });
  await history.getByRole('listitem').first().hover();
  await history.getByRole('button', { name: /重命名/ }).first().click();
  const rename = history.getByRole('textbox');
  await rename.fill('WORKBENCH_RENAMED');
  await rename.press('Enter');
  await expect(history.getByRole('button', { name: 'WORKBENCH_RENAMED', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-chat-inline-header').getByRole('button', { name: /历史/ }).click();
  await expect(history.getByRole('button', { name: 'WORKBENCH_RENAMED', exact: true })).toBeVisible();
  await history.getByRole('listitem').filter({ hasText: 'WORKBENCH_RENAMED' }).hover();
  await history.getByRole('button', { name: /删除.*WORKBENCH_RENAMED/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /删\s*除/  }).click();
  await expect(history.getByRole('button', { name: 'WORKBENCH_RENAMED', exact: true })).toHaveCount(0);
});


test('generated JSON can be inspected without mutation, applied, and saved locally', async ({ page }) => {
  const diagram = {
    name: 'AI Generated', type: 'flowchart', version: '1.0.0',
    layout: { type: 'flow', direction: 'TB', spacing: { horizontal: 80, vertical: 80 }, padding: { horizontal: 24, vertical: 24 } },
    theme: { name: 'default', displayName: 'Default', domains: {} },
    nodes: [{ id: 'ai-generated-test-node', type: 'flowchartNode', description: 'WORKBENCH_GENERATED', domain: 'test', domainClass: 'core', data: { shape: 'rectangle' } }],
    edges: [],
  };
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    await route.fulfill({ status: 200, contentType: 'text/event-stream', headers,
      body: reply('```json\n' + JSON.stringify(diagram) + '\n```') });
  });
  await openChat(page);
  await configure(page);
  await submit(page, '/generate simple flow');
  const generatedNode = page.locator('.react-flow__node').filter({ hasText: 'WORKBENCH_GENERATED' });
  await page.getByRole('button', { name: '查看源代码', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '查看源代码', exact: true });
  await expect(preview).toContainText('WORKBENCH_GENERATED');
  await expect(generatedNode).toHaveCount(0);
  await preview.getByRole('button', { name: /关\s*闭/  }).click();
  await page.getByRole('button', { name: '应用到画布', exact: true }).click();
  await page.getByRole('dialog', { name: 'AI 变更预览', exact: true }).getByRole('button', { name: '确认应用变更', exact: true }).click();
  await expect(generatedNode).toHaveCount(1);
  if (!await input(page).isVisible()) await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-chat-actions-capsule').getByRole('button', { name: '保存图表', exact: true }).click();
  await page.getByRole('menuitem', { name: /本地/ }).click();
  const saveDialog = page.getByRole('dialog', { name: '保存图表', exact: true });
  await saveDialog.getByRole('textbox').fill('WORKBENCH_SAVED');
  await saveDialog.getByRole('button', { name: '确认保存', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some(value => value.includes('WORKBENCH_SAVED')))).toBe(true);
});


test('mindmap brainstorming sends one request with the requested topic and remains usable', async ({ page }) => {
  const bodies: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', headers, body: reply(`BRAINSTORM_OK_${bodies.length}`) });
  });
  await openChat(page, 'mindmap-unified');
  await configure(page);
  await submit(page, '/brainstorm 物流');
  await expect(page.getByText('BRAINSTORM_OK_1', { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toContain('物流');
  expect(bodies[0]).toContain('3-5');
  expect(bodies[0]).toContain('[当前画布状态]');
  expect(bodies[0]).toContain('root');
  await submit(page, 'Continue');
  await expect(page.getByText('BRAINSTORM_OK_2', { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2);
});

test('selected JSON edits preview one update, cancel safely, and undo as one operation', async ({ page }) => {
  await openChat(page);
  await configure(page);
  await submit(page, '/add WORKBENCH_SCOPED');
  const node = page.locator('.react-flow__node').filter({ hasText: 'WORKBENCH_SCOPED' });
  await expect(node).toHaveCount(1);
  const id = await node.getAttribute('data-id');
  expect(id).toBeTruthy();
  const nodeCount = await page.locator('.react-flow__node').count();
  const edgeCount = await page.locator('.react-flow__edge').count();
  await page.getByRole('button', { name: /^适应 \(/ }).click();
  await node.click();
  await expect(node).toHaveClass(/selected/);
  if (!await input(page).isVisible()) await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.getByRole('combobox', { name: 'AI 工作模式', exact: true }).click();
  await page.getByText('仅修改选中部分', { exact: true }).filter({ visible: true }).click();
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(route.request().postData()).toContain('[EDIT SCOPE: selection]');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', headers,
      body: reply('```json\n' + JSON.stringify({ nodes: [{ id, type: 'flowchartNode',
        description: 'WORKBENCH_SCOPED_EDITED', domain: 'scoped', data: { label: 'WORKBENCH_SCOPED_EDITED', shape: 'rectangle' } }], edges: [] }) + '\n```') });
  });
  await submit(page, 'Only update the selected label.');
  const apply = page.getByRole('button', { name: '应用到画布', exact: true });
  await apply.click();
  const preview = page.getByRole('dialog', { name: 'AI 变更预览', exact: true });
  await expect(preview).toContainText('新增 0 项 · 修改 1 项 · 删除 0 项');
  await preview.getByRole('button', { name: /^取\s*消$/ }).click();
  await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toContainText('WORKBENCH_SCOPED');
  await expect(page.locator('.react-flow__node').filter({ hasText: 'WORKBENCH_SCOPED_EDITED' })).toHaveCount(0);
  await apply.click();
  await preview.getByRole('button', { name: '确认应用变更', exact: true }).click();
  const edited = page.locator(`.react-flow__node[data-id="${id}"]`);
  await expect(edited).toContainText('WORKBENCH_SCOPED_EDITED');
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount);
  await expect(page.locator('.react-flow__edge')).toHaveCount(edgeCount);
  await page.getByRole('button', { name: '撤销 (Ctrl+Z)', exact: true }).click();
  await expect(edited).not.toContainText('WORKBENCH_SCOPED_EDITED');
  await page.getByRole('button', { name: '重做 (Ctrl+Y)', exact: true }).click();
  await expect(edited).toContainText('WORKBENCH_SCOPED_EDITED');
  await expect(page.locator('.react-flow__node')).toHaveCount(nodeCount);
  await expect(page.locator('.react-flow__edge')).toHaveCount(edgeCount);
});
