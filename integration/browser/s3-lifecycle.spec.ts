import { expect, test, type Page } from '@playwright/test';
import { coerceS3StorageConfig } from '../../src/services/storageSecurity';
import { createS3FetchClient, __s3FetchClientTestUtils } from '../../src/services/s3FetchClient';

const endpoint = process.env.VIZLY_S3_TEST_ENDPOINT;
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Isolated S3 endpoint required');
const config = coerceS3StorageConfig({ endpoint, bucket: `vizly-browser-integration-${process.pid}`, region: 'us-east-1',
  accessKeyId: process.env.VIZLY_S3_TEST_ACCESS_KEY, secretAccessKey: process.env.VIZLY_S3_TEST_SECRET_KEY });
if (!config) throw new Error('Invalid isolated S3 configuration');
const client = createS3FetchClient(config);
const safeConfig = config;
const networkFacts = new WeakMap<Page, Array<{ method: string; status?: number; failed?: boolean }>>();
const readId = (page: Page) => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('diagram'));
const readDocument = async (key: string) => {
  const raw: unknown = JSON.parse((await client.getObject(key)).bodyText);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid fixture document');
  return raw as Record<string, unknown>;
};

test.beforeAll(async () => {
  const signed = await __s3FetchClientTestUtils.signS3Request({ config: safeConfig, method: 'PUT', now: new Date() });
  const response = await fetch(signed.url, { method: signed.method, headers: signed.headers });
  if (!response.ok) throw new Error('Isolated browser bucket initialization failed');
  await response.body?.cancel();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(storage => {
    const { secretAccessKey, ...draft } = storage;
    localStorage.setItem('diagram_storage_config', JSON.stringify(draft));
    sessionStorage.setItem('diagram_storage_config_secret', secretAccessKey);
    localStorage.setItem('DiagramView.StorageProvider', 's3');
    localStorage.setItem('i18nextLng', 'zh');
  }, safeConfig);
});

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('s3-network-status', { body: JSON.stringify(networkFacts.get(page) ?? []), contentType: 'application/json' });
  if (testInfo.status === testInfo.expectedStatus) return;
  const facts = await page.evaluate(() => ({
    provider: localStorage.getItem('DiagramView.StorageProvider'),
    configPresent: Boolean(localStorage.getItem('diagram_storage_config')),
    secretPresent: Boolean(sessionStorage.getItem('diagram_storage_config_secret')),
    alertPresent: Boolean(document.querySelector('[role="alert"]')),
    illegalFetchInvocation: document.querySelector('[role="alert"]')?.textContent?.includes('Illegal invocation') ?? false,
    bridgeCloud: (() => {
      const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('diagram') ?? '';
      const state = window as Window & { __flowDataBridge?: Record<string, { metadata?: { cloud?: { provider?: string; id?: string; revision?: string } } }> };
      const cloud = state.__flowDataBridge?.[id]?.metadata?.cloud;
      return { present: Boolean(cloud), provider: cloud?.provider, idMatches: cloud?.id === id, revisionPresent: Boolean(cloud?.revision) };
    })(),
  }));
  await testInfo.attach('s3-failure-facts', { body: JSON.stringify(facts), contentType: 'application/json' });
});

async function cloudCard(page: Page, key: string, previewRequired = true) {
  await page.goto('/#/manage');
  await page.locator('[data-workspace-filter-view="cloud"]').click();
  const title = key.replace('.json', '');
  const card = page.locator('.diagram-card').filter({ has: page.getByText(title, { exact: true }) });
  await expect(card).toBeVisible();
  if (previewRequired) {
    await expect(card.locator('.remote-diagram-cover')).toHaveAttribute('data-preview-status', 'ready');
    await expect.poll(() => card.locator('.remote-diagram-cover img').evaluate(image =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  }
  return card;
}

for (const scenario of ['new', 'path'] as const) {
  test(`${scenario} S3 diagram preserves its canonical key through preview, reopen, update and delete`, async ({ page }, testInfo) => {
    const network: Array<{ method: string; status?: number; failed?: boolean }> = [];
    page.on('response', response => { if (response.url().startsWith(endpoint!)) network.push({ method: response.request().method(), status: response.status() }); });
    page.on('requestfailed', request => { if (request.url().startsWith(endpoint!)) network.push({ method: request.method(), failed: true }); });
    networkFacts.set(page, network);
    let key: string;
    if (scenario === 'new') {
      await page.goto('/#/manage');
      await page.getByRole('button', { name: '新建流程图', exact: true }).click();
      await page.getByRole('button', { name: '选择第一个图形', exact: true }).click();
      await page.getByRole('dialog', { name: '基础形状', exact: true }).getByRole('button', { name: '矩形', exact: true }).click();
      await expect(page.locator('.react-flow__node')).toHaveCount(1);
      const originalId = await readId(page);
      await page.getByRole('button', { name: '保存选项', exact: true }).click();
      await page.getByRole('menuitem', { name: '另存为 — S3', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '另存为至 S3...', exact: true });
      await dialog.getByRole('textbox', { name: '图表名称', exact: true }).fill('AUDIT S3 NEW LIFECYCLE');
      await dialog.getByRole('button', { name: /^确\s*定$/ }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(() => readId(page)).not.toBe(originalId);
      const savedId = await readId(page);
      if (!savedId) throw new Error('Saved canonical route missing');
      key = savedId;
      expect(key).toMatch(/\.json$/);
    } else {
      key = 'nested/audit-path.json';
      await client.putObject(key, JSON.stringify({ id: key, name: 'AUDIT S3 PATH LIFECYCLE', type: 'flowchart', version: '1.0.0',
        nodes: [{ id: 's3-node', type: 'custom', domain: '业务域', domainClass: 'core', description: 'S3 Path Original', data: {},
          metadata: { shape: 'rectangle', width: 200, height: 64, canvasPosition: { x: 200, y: 160 } } }], edges: [], groups: [],
        layout: { type: 'custom', direction: 'LR', padding: { top: 20, right: 20, bottom: 20, left: 20 }, spacing: { horizontal: 50, vertical: 50 } },
        theme: { name: 'manual', displayName: 'Manual', domains: {}, isCustom: true }, metadata: { title: 'AUDIT S3 PATH LIFECYCLE' },
      }), 'application/json');
    }
    expect((await readDocument(key)).id).toBe(key);
    const card = await cloudCard(page, key, scenario === 'new');
    if (scenario === 'new') await testInfo.attach('s3-initial-preview', { body: await page.screenshot(), contentType: 'image/png' });
    await card.getByRole('button', { name: `打开图表 ${key.replace('.json', '')}`, exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    expect(await readId(page)).toBe(key);
    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible();
    const dismissOnboarding = page.getByRole('button', { name: '不再提示', exact: true });
    if (await dismissOnboarding.isVisible()) {
      await dismissOnboarding.click();
      await expect(dismissOnboarding).toBeHidden();
    }
    await node.dblclick();
    const editor = node.getByRole('textbox', { name: /^(编辑节点文本|Edit Node Text)$/ });
    const label = `AUDIT S3 ${scenario.toUpperCase()} UPDATED`;
    await editor.fill(label);
    await editor.press('Tab');
    await expect(node).toContainText(label);
    await page.getByRole('button', { name: '保存选项', exact: true }).click();
    const [saved] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'PUT' && response.url().startsWith(endpoint!), { timeout: 20_000 }),
      (async () => {
        await page.getByRole('menuitem', { name: '保存到当前位置', exact: true }).click();
        await expect(page.locator('.ant-message')).toContainText('覆盖保存成功', { timeout: 15_000 });
      })(),
    ]);
    expect(saved.status()).toBe(200);
    const stored = await readDocument(key);
    const metadata = stored.metadata && typeof stored.metadata === 'object' ? stored.metadata as Record<string, unknown> : {};
    const preview = metadata.preview && typeof metadata.preview === 'object' ? metadata.preview as Record<string, unknown> : {};
    const previewFacts = { present: Boolean(metadata.preview), mime: preview.mime, width: preview.width, height: preview.height, dataUrlLength: typeof preview.dataUrl === 'string' ? preview.dataUrl.length : 0 };
    await testInfo.attach('s3-stored-preview-facts', { body: JSON.stringify(previewFacts), contentType: 'application/json' });
    expect(previewFacts.present, 'Real save must persist its generated preview').toBe(true);
    expect(stored.id).toBe(key);
    expect(JSON.stringify(stored)).toContain(label);
    const signedList = await __s3FetchClientTestUtils.signS3Request({ config: safeConfig, method: 'GET', now: new Date(), query: new URLSearchParams({ 'list-type': '2' }) });
    const listedResponse = await fetch(signedList.url, { method: signedList.method, headers: signedList.headers });
    expect(listedResponse.ok).toBe(true);
    const listedKeys = await page.evaluate(xml => [...new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('Contents > Key')].map(item => item.textContent), await listedResponse.text());
    expect(listedKeys.filter(item => item === key)).toHaveLength(1);
    expect(listedKeys).not.toContain(`${key}.json`);
    const updatedCard = await cloudCard(page, key);
    await testInfo.attach('s3-ready-preview', { body: await page.screenshot(), contentType: 'image/png' });
    await updatedCard.getByRole('button', { name: `打开图表 ${key.replace('.json', '')}`, exact: true }).click();
    await expect(page.locator('.react-flow__node')).toContainText(label);
    await page.reload();
    await expect(page.locator('.react-flow__node')).toContainText(label);
    const finalCard = await cloudCard(page, key);
    await finalCard.getByRole('button', { name: `${key.replace('.json', '')} 的更多操作`, exact: true }).click();
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
    await expect(finalCard).toHaveCount(0);
    await expect(client.getObject(key)).rejects.toThrow('HTTP 404');
    await testInfo.attach('s3-lifecycle', { body: JSON.stringify({ scenario, canonicalKey: key, previewReady: true, updatePersisted: true, reopenedAfterUpdate: true, deleted: true }), contentType: 'application/json' });
  });
}
