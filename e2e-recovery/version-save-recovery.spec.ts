import { expect, test, type Page } from '@playwright/test';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const authKey = 'sb-recovery-fixture-auth-token';
const makeSession = (id: string, sessionId: string) => {
  const user = { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.invalid`, app_metadata: {}, user_metadata: {}, created_at: '2026-10-25T00:00:00Z' };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, session_id: sessionId, aud: 'authenticated', exp: expires })}.synthetic`,
    refresh_token: 'synthetic-fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expires, user };
};
const switchAccount = async (page: Page, session: ReturnType<typeof makeSession> | null) => {
  await page.evaluate(({ session, authKey }) => {
    if (session) localStorage.setItem(authKey, JSON.stringify(session)); else localStorage.removeItem(authKey);
    const channel = new BroadcastChannel(authKey);
    channel.postMessage({ event: session ? 'SIGNED_IN' : 'SIGNED_OUT', session }); channel.close();
  }, { session, authKey });
  await expect.poll(() => page.evaluate(() => window.__currentUserId)).toBe(session?.user.id ?? null);
};
test('version retry verifies cloud storage, retains 403 locally and isolates account drafts', async ({ page }) => {
  const diagramId = '33333333-3333-4333-8333-333333333333';
  let current = makeSession(a, 'version-a');
  let mode: 'offline' | 'forbidden' | 'ok' | 'lose-response' = 'offline';
  let writes = 0; let reads = 0;
  const remote: Record<string, unknown>[] = [];
  await page.route('https://recovery-fixture.supabase.co/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    let body: unknown = [];
    if (url.pathname.endsWith('/user')) body = current.user;
    if (url.pathname.endsWith('/diagram_versions')) {
      if (request.method() === 'POST') {
        writes++;
        if (mode === 'offline') { await route.abort('internetdisconnected'); return; }
        if (mode === 'forbidden') { await route.fulfill({ status: 403, json: { code: '42501', message: 'fixture denied' } }); return; }
        const payload = request.postDataJSON();
        if (remote.some(row => row.id === payload.id)) { await route.fulfill({ status: 409, json: { code: '23505', message: 'duplicate' } }); return; }
        const row = { ...payload, created_at: new Date().toISOString() };
        remote.push(row); body = row;
        if (mode === 'lose-response') { mode = 'ok'; await route.abort('internetdisconnected'); return; }
      } else if (url.searchParams.has('id')) {
        reads++; body = remote.find(row => `eq.${row.id}` === url.searchParams.get('id')) ?? null;
      } else body = remote;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(({ session, authKey }) => {
    localStorage.setItem('i18nextLng', 'zh');
    if (!localStorage.getItem(authKey)) localStorage.setItem(authKey, JSON.stringify(session));
  }, { session: current, authKey });
  await page.goto('/#/manage');
  await expect.poll(() => page.evaluate(() => window.__currentUserId)).toBe(a);
  await page.evaluate(async id => {
    const request = indexedDB.open('VizlyLocalDB');
    request.onupgradeneeded = () => {
      const versions = request.result.createObjectStore('diagram_versions', { keyPath: 'id' });
      versions.createIndex('diagramId', 'diagramId'); versions.createIndex('createdAt', 'createdAt');
      request.result.createObjectStore('local_diagrams', { keyPath: 'id' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction('local_diagrams', 'readwrite');
    tx.objectStore('local_diagrams').put({ id, name: 'Version fixture', type: 'flowchart', version: '1.0', metadata: { title: 'Version fixture' },
      nodes: [{ id: 'node', type: 'custom', domain: '业务域', domainClass: 'core', description: 'Version fixture node', data: {}, metadata: { shape: 'rectangle', width: 180, height: 60, canvasPosition: { x: 100, y: 100 } } }],
      edges: [], groups: [], theme: { name: 'manual', displayName: 'Manual', domains: {} },
      layout: { type: 'custom', direction: 'LR', padding: { horizontal: 20, vertical: 20 }, spacing: { horizontal: 50, vertical: 50 } } });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    db.close();
  }, diagramId);
  await page.goto(`/#/?diagram=${diagramId}`);
  await expect(page.locator('.react-flow__node[data-id="node"]')).toBeVisible();
  const open = async () => {
    await page.getByRole('button', { name: '文档操作', exact: true }).click();
    await page.getByRole('menuitem', { name: /版本快照/ }).click();
  };
  await open();
  const panel = page.locator('.version-history-drawer');
  await panel.getByRole('textbox').fill('Account A offline version');
  await panel.locator('.version-history-save').click();
  let row = panel.locator('.version-history-list-item').filter({ hasText: 'Account A offline version' });
  await expect(row.getByText('仅本机保存，尚未同步', { exact: true })).toBeVisible();
  await expect.poll(() => writes).toBeGreaterThanOrEqual(1);
  await page.reload(); await open();
  row = panel.locator('.version-history-list-item').filter({ hasText: 'Account A offline version' });
  await expect(row).toBeVisible();
  mode = 'forbidden';
  await row.getByRole('button', { name: '重试云同步', exact: true }).click();
  await expect(row.getByText('权限不足，请联系图表所有者授权。', { exact: true })).toBeVisible();
  await expect(row.getByText('自动重试已停止；请处理下方问题后手动重试，本地副本已保留。', { exact: true })).toBeVisible();
  const writesBeforeSwitch = writes;
  current = makeSession(b, 'version-b'); await switchAccount(page, current);
  await expect(panel.getByText('Account A offline version', { exact: true })).toHaveCount(0);
  expect(writes).toBe(writesBeforeSwitch);
  current = makeSession(a, 'version-a2'); await switchAccount(page, current);
  await expect(row).toBeVisible();
  mode = 'ok';
  await row.getByRole('button', { name: '重试云同步', exact: true }).click();
  await expect(row.getByText('已保存到云端', { exact: true })).toBeVisible();
  expect(reads).toBeGreaterThanOrEqual(1); expect(remote).toHaveLength(1);
  expect(remote[0].author_id).toBe(a);
  mode = 'lose-response';
  const writesBeforeLostResponse = writes;
  await panel.getByRole('textbox').fill('Automatic compensation after lost response');
  await panel.locator('.version-history-save').click();
  const compensated = panel.locator('.version-history-list-item').filter({ hasText: 'Automatic compensation after lost response' });
  await expect(compensated.getByText('已保存到云端', { exact: true })).toBeVisible();
  expect(remote).toHaveLength(2);
  expect(writes - writesBeforeLostResponse).toBe(2);
  expect(remote.every(row => row.author_id === a)).toBe(true);
  await page.reload(); await open();
  await expect(panel.getByText('已保存到云端', { exact: true })).toHaveCount(2);
});
