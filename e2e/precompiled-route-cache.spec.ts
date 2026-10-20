import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Response } from '@playwright/test';

const artifactRoot = resolve('node_modules/@vizly/core/dist/assets');
const snapshots = readdirSync(artifactRoot).filter(name => /^route-\d+[^/]*\.json$/.test(name)).map(fileName => {
  const value: unknown = JSON.parse(readFileSync(resolve(artifactRoot, fileName), 'utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid packaged route snapshot');
  const data = value as Record<string, unknown>;
  if (data.hardClean !== true || typeof data.inputSignature !== 'string'
    || typeof data.inputGeometryDigest !== 'string' || typeof data.outputRouteSignature !== 'string') {
    throw new Error('Invalid packaged route snapshot metadata');
  }
  return { fileName, inputSignature: data.inputSignature, geometry: data.inputGeometryDigest, signature: data.outputRouteSignature };
});

const readRouteState = (page: Page) => page.evaluate(() => {
  const record = (value: unknown): Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {}
  );
  const state = record((window as unknown as Record<string, unknown>).__vizlyBaseReactFlowDisplayRouting);
  const diagnostic = record(state.precompiledRouteDiagnostic);
  return {
    stage: state.stage,
    reason: diagnostic.reason,
    authority: state.renderAuthorityStatus,
    signature: state.outputRouteSignature,
    inputSignature: state.signature,
    geometry: state.inputGeometryDigest,
    edgeCount: document.querySelectorAll('.react-flow__edge').length,
  };
});

const expectCommittedRoute = async (page: Page) => {
  await expect.poll(() => readRouteState(page)).toMatchObject({
    stage: 'final-applied', authority: 'accepted',
  });
  const state = await readRouteState(page);
  expect(state.edgeCount).toBeGreaterThan(0);
  expect(state.signature).toMatch(/^route-v2:\d+:\d+:[0-9a-f]+$/);
  return state;
};

const expectSnapshotDecision = (state: Awaited<ReturnType<typeof readRouteState>>) => {
  const snapshot = snapshots.find(candidate => candidate.inputSignature === state.inputSignature && candidate.geometry === state.geometry);
  // Text measurement can produce different input geometry across platforms.
  // Only an exact descriptor may hit; other inputs must use Worker fallback.
  expect(state.reason).toBe(snapshot ? 'hit' : 'miss:no-descriptor');
  if (snapshot) expect(state.signature).toBe(snapshot.signature);
};

for (const presetId of [
  'enterprise-architecture-v2', 'wms-process-flow-v1',
  'logistics-architecture-v1', 'wms-demand-allocation-strategy-v2',
]) {
  test(`preset route uses only matching snapshots and survives reload: ${presetId}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.name));
    await page.goto(`/#/?diagram=${presetId}`);
    const initial = await expectCommittedRoute(page);
    expectSnapshotDecision(initial);
    // This preset's fixed node geometry supplies a positive hit case on both
    // Windows and Linux, so an always-miss implementation cannot pass the suite.
    if (presetId === 'enterprise-architecture-v2') expect(initial.reason).toBe('hit');
    // Persisted documents may change the input identity; every reload still
    // needs an accepted Worker commit and the same final route geometry.
    await page.reload();
    const reloaded = await expectCommittedRoute(page);
    expect(reloaded.signature).toBe(initial.signature);
    expect(reloaded.edgeCount).toBe(initial.edgeCount);
    expect(pageErrors).toEqual([]);
    await testInfo.attach('route cache acceptance', {
      contentType: 'application/json', body: JSON.stringify({ initial, reloaded }),
    });
  });
}

test('WMS swimlane layout accepts its precomputed route', async ({ page }) => {
  const downloads = new Map<string, Response>();
  page.on('response', response => {
    if (/\/route-\d+[^/]*\.json(?:\?|$)/.test(response.url())) downloads.set(response.url(), response);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/#/?diagram=wms-process-flow-v1');
  const initial = await expectCommittedRoute(page);
  expectSnapshotDecision(initial);
  await page.getByRole('button', { name: /自动布局|layout/i }).click();
  const parent = page.locator('[data-menu-id$="group-swimlane-process"]').filter({ visible: true });
  await parent.hover();
  await page.locator('[data-menu-id$="domain-lanes-lr"]').filter({ visible: true }).click();
  await expect.poll(async () => (await readRouteState(page)).signature).not.toBe(initial.signature);
  const layout = await expectCommittedRoute(page);
  const snapshot = snapshots.find(candidate => candidate.inputSignature === layout.inputSignature && candidate.geometry === layout.geometry);
  if (snapshot) {
    await expect.poll(() => [...downloads.values()].some(response => response.url().includes(`/${snapshot.fileName}`))).toBe(true);
    const response = [...downloads.values()].find(item => item.url().includes(`/${snapshot.fileName}`));
    if (!response) throw new Error('Matching layout snapshot was not downloaded');
    expect(response.ok()).toBe(true);
    const artifact: unknown = await response.json();
    expect(artifact).toMatchObject({
      hardClean: true, inputSignature: layout.inputSignature,
      inputGeometryDigest: layout.geometry, outputRouteSignature: layout.signature,
    });
  }
  expect(layout.edgeCount).toBe(initial.edgeCount);
});
