import { expect, test } from '@playwright/test';

test('documentation stays outside Antd, canvas CSS and collaboration runtime', async ({ page }, testInfo) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    page.on('pageerror', error => errors.push(error.name));
    await page.goto('/?test=docs');
    await expect(page.locator('[data-smoke-ready="docs-preview"]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(requests.filter(path => /(?:antd-vendor|YjsCollaborationDriver|\/yjs-)/u.test(path))).toEqual([]);
    expect(await page.evaluate(() => [...document.styleSheets].some(sheet => [...sheet.cssRules]
        .some(rule => rule.cssText.includes('--xy-background-color-default'))))).toBe(false);
    expect(errors).toEqual([]);
    await testInfo.attach('cold-document-resources', { body: JSON.stringify(requests), contentType: 'application/json' });
});

test('standalone canvas loads its CSS without loading Yjs', async ({ page }, testInfo) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    page.on('pageerror', error => errors.push(error.name));
    await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
    await expect(page.locator('.react-flow__node[data-id="order-import"]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(requests.filter(path => /(?:YjsCollaborationDriver|\/yjs-)/u.test(path))).toEqual([]);
    expect(await page.evaluate(() => [...document.styleSheets].some(sheet => [...sheet.cssRules]
        .some(rule => rule.cssText.includes('--xy-background-color-default'))))).toBe(true);
    expect(errors).toEqual([]);
    await testInfo.attach('standalone-canvas', { body: await page.screenshot(), contentType: 'image/png' });
});
