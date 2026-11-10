import { expect, test, type Page } from '@playwright/test';
const openConfig = async (page: Page) => {
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-chat-inline-secondary').getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 平台与模型配置' });
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  return dialog;
};
for (const width of [390, 1440]) test(`AI key stays in the page session and requires re-entry after reload / ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  let dialog = await openConfig(page);
  await expect(dialog.getByText('未勾选“本机加密记住”时，密钥仅在本次页面有效，刷新或退出后需重新输入。', { exact: false })).toBeVisible();
  const key = 'synthetic-browser-session-canary';
  await dialog.getByLabel('API Key', { exact: true }).fill(key);
  await dialog.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(secret => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(secret), key)).toBe(false);
  await page.locator('.ai-chat-inline-secondary').getByRole('button', { name: '设置', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'AI 平台与模型配置' });
  await dialog.getByRole('button', { name: /^Gemini \(Google\)/ }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue(key);
  await expect(dialog.getByText('当前会话密钥已就绪', { exact: true })).toBeVisible();
  await dialog.getByLabel('API Key', { exact: true }).fill('');
  await expect(dialog.getByText('尚未配置密钥', { exact: true })).toBeVisible();
  await page.reload();
  dialog = await openConfig(page);
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(dialog.getByText('请重新输入当前会话的密钥', { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) test(`encrypted opt-in restores the key after reload and device deletion removes it / ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
  let dialog = await openConfig(page);
  const key = 'synthetic-encrypted-browser-canary';
  await dialog.getByLabel('API Key', { exact: true }).fill(key);
  await dialog.getByRole('switch', { name: '在此浏览器加密记住密钥', exact: true }).check();
  await dialog.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const persisted = await page.evaluate(async secret => {
    const request = indexedDB.open('VizlyAICredentials', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Vault unavailable'));
    });
    try {
      const all = (store: string) => new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const read = db.transaction(store).objectStore(store).getAll();
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(new Error('Vault read failed'));
      });
      const [keys, records] = await Promise.all([all('keys'), all('credentials')]);
      return {
        plaintextInWebStorage: JSON.stringify({ ...localStorage, ...sessionStorage }).includes(secret),
        ciphertextStored: records.some(row => row.ciphertext instanceof ArrayBuffer && row.ciphertext.byteLength > 0),
        plaintextInCiphertext: records.some(row => row.ciphertext instanceof ArrayBuffer && new TextDecoder().decode(row.ciphertext).includes(secret)),
        nonExtractableKey: keys.some(row => row.key instanceof CryptoKey && !row.key.extractable && row.key.algorithm.name === 'AES-GCM'),
      };
    } finally { db.close(); }
  }, key);
  expect(persisted).toEqual({ plaintextInWebStorage: false, ciphertextStored: true, plaintextInCiphertext: false, nonExtractableKey: true });
  await page.reload();
  dialog = await openConfig(page);
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue(key);
  await dialog.getByRole('button', { name: '删除本机保存的密钥', exact: true }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.reload();
  dialog = await openConfig(page);
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('switch', { name: '在此浏览器加密记住密钥', exact: true })).not.toBeChecked();
});
