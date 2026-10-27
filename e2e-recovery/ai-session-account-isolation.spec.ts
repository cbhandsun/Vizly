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
const cloudConfig = { activeModelKey: 'gemini:model', systemPrompt: 'legacy preference', providers: [{ id: 'gemini', name: 'Gemini (Google)', enabled: true,
  baseUrl: 'https://example.invalid/v1', apiKey: 'ENC2:legacy-fixture-preserve', models: [{ id: 'model', name: 'Model', enabled: true }] }] };
const switchAccount = async (page: Page, session: ReturnType<typeof makeSession> | null) => {
  await page.evaluate(({ session, authKey }) => {
    if (session) localStorage.setItem(authKey, JSON.stringify(session)); else localStorage.removeItem(authKey);
    const channel = new BroadcastChannel(authKey);
    channel.postMessage({ event: session ? 'SIGNED_IN' : 'SIGNED_OUT', session }); channel.close();
  }, { session, authKey });
  await expect.poll(() => page.evaluate(() => window.__currentUserId)).toBe(session?.user.id ?? null);
};
test('cloud saves omit keys, legacy records survive, and account changes clear an open credential draft', async ({ page }) => {
  const writes: Record<string, unknown>[] = [];
  const saved = new Map<string, unknown>();
  let current = makeSession(a, 'a-first');
  await page.route('https://recovery-fixture.supabase.co/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    let body: unknown = [];
    if (url.pathname.endsWith('/user')) body = current.user;
    if (url.pathname.endsWith('/user_configs')) {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON() as Record<string, unknown>; writes.push(payload);
        saved.set(`${payload.user_id}:${payload.key}`, payload.value); body = payload;
      } else {
        const owner = url.searchParams.get('user_id')?.replace(/^eq\./, '');
        const key = url.searchParams.get('key')?.replace(/^eq\./, '');
        const value = key ? saved.get(`${owner}:${key}`) ?? (owner === a && key === 'ai_config' ? cloudConfig : null) : null;
        body = value ? [{ value }] : [];
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(({ session, authKey, cloudConfig }) => {
    localStorage.setItem('i18nextLng', 'zh'); localStorage.setItem(authKey, JSON.stringify(session));
    localStorage.setItem(`DiagramView.AIConfig_V2_Advanced_${session.user.id}`, JSON.stringify(cloudConfig));
  }, { session: current, authKey, cloudConfig });
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  await expect.poll(() => page.evaluate(() => window.__currentUserId)).toBe(a);
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-chat-inline-secondary').getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 平台与模型配置' });
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await expect(dialog.getByText('旧凭证未恢复，请重新输入；旧记录保持不变', { exact: true })).toBeVisible();
  const secret = 'synthetic-account-session-canary';
  await dialog.getByLabel('API Key', { exact: true }).fill(secret);
  await dialog.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const aiWrites = writes.filter(row => row.key === 'ai_config_v3');
  expect(aiWrites).toHaveLength(1); expect(aiWrites[0]).toMatchObject({ key: 'ai_config_v3', user_id: a });
  expect(writes.some(row => row.key === 'ai_config')).toBe(false);
  expect(JSON.stringify(writes)).not.toContain(secret);
  await page.locator('.ai-chat-inline-secondary').getByRole('button', { name: '设置', exact: true }).click();
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue(secret);
  current = makeSession(b, 'b-first'); await switchAccount(page, current);
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  await switchAccount(page, null);
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  current = makeSession(a, 'a-second'); await switchAccount(page, current);
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(dialog.getByText('请重新输入当前会话的密钥', { exact: true })).toBeVisible();
  expect(await page.evaluate(({ a, secret }) => ({
    legacy: localStorage.getItem(`DiagramView.AIConfig_V2_Advanced_${a}`),
    leaked: JSON.stringify({ ...localStorage, ...sessionStorage }).includes(secret),
  }), { a, secret })).toEqual({ legacy: JSON.stringify(cloudConfig), leaked: false });
});
