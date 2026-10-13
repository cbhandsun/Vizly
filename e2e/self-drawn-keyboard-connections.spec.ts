import { expect, test } from '@playwright/test';

test('pointer connection hits the canonical port and survives undo, redo, and reload', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/#/manage');
    await page.getByRole('button', { name: '新建流程图', exact: true }).click();
    await page.getByRole('button', { name: '更多操作', exact: true }).click();
    const diagram = {
        id: 'pointer-regression', name: 'Pointer regression', type: 'flowchart', version: '2.0.0',
        nodes: [
            { id: 'source', type: 'flowchart', label: 'Long connection source', description: 'Postgres collaborator synchronization verification with long unbroken identifier ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', metadata: { canvasPosition: { x: 0, y: 0 }, width: 83, height: 141, shape: 'rectangle' } },
            { id: 'target', type: 'flowchart', label: '连接终点', description: '连接终点', metadata: { canvasPosition: { x: 420, y: 0 }, width: 180, height: 80, shape: 'rectangle' } },
        ], edges: [], layout: { direction: 'TB', generateDomainGroups: false },
    };
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '导入 JSON / Mermaid...' }).click();
    await (await chooserPromise).setFiles({ name: 'pointer-regression.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(diagram)) });
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect.poll(() => page.locator('.react-flow__node[data-id="source"]').evaluate(node => {
        const bounds = node.getBoundingClientRect();
        const text = node.querySelector('.flowchart-node-title')?.getBoundingClientRect();
        return Number.parseFloat((node as HTMLElement).style.width) >= 120 && Boolean(text
            && text.top >= bounds.top && text.bottom <= bounds.bottom && text.left >= bounds.left && text.right <= bounds.right);
    })).toBe(true);
    const library = page.getByRole('dialog', { name: '基础形状', exact: true });
    if (await library.isVisible()) await library.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: /^适应 \(/ }).click();
    const source = page.locator('[data-nodeid="source"][data-handleid="right"][role="button"]');
    const target = page.locator('[data-nodeid="target"][data-handleid="left"][role="button"]');
    await page.locator('.react-flow__node[data-id="source"]').hover();
    await expect(source).toBeVisible();
    const start = await source.boundingBox();
    const end = await target.boundingBox();
    if (!start || !end) throw new Error('Connection endpoint is not visible');
    const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const to = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
    expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('.react-flow__handle')?.getAttribute('data-handleid'), from)).toBe('right');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.getByRole('button', { name: '撤销 (Ctrl+Z)', exact: true }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    await page.getByRole('button', { name: '重做 (Ctrl+Y)', exact: true }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible();
    await page.reload();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('self-drawn ports remain keyboard accessible in overview and toolbar follows the active canvas', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    await page.goto('/#/manage');
    await page.getByRole('button', { name: '新建流程图', exact: true }).click();
    await expect(page.getByRole('button', { name: '更多操作', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '更多操作', exact: true }).click();
    const diagram = {
        id: 'keyboard-regression', name: 'Keyboard regression', type: 'flowchart', version: '2.0.0',
        nodes: [
            { id: 'source', type: 'flowchart', label: '起点', description: '起点', metadata: { canvasPosition: { x: 0, y: 0 }, width: 180, height: 80, shape: 'rectangle' } },
            { id: 'target', type: 'flowchart', label: '终点', description: '终点', metadata: { canvasPosition: { x: 0, y: 3000 }, width: 180, height: 80, shape: 'rectangle' } },
        ], edges: [], layout: { direction: 'TB', generateDomainGroups: false },
    };
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '导入 JSON / Mermaid...' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'keyboard-regression.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(diagram)) });
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    const library = page.getByRole('dialog', { name: '基础形状', exact: true });
    if (await library.isVisible()) await library.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: /^适应 \(/ }).click();
    await expect(page.locator('.diagram-zoomed-out')).toBeVisible();
    // Enter the node using the same focus-and-Tab path available to keyboard users.
    await page.getByRole('treeitem', { name: /^节点：起点/ }).press('Tab');
    const source = page.getByRole('button', { name: '起点 — 上方', exact: true });
    await expect(source).toBeFocused();
    await source.press('Enter');
    await page.getByRole('treeitem', { name: /^节点：终点/ }).press('Tab');
    await page.getByRole('button', { name: '终点 — 上方', exact: true }).press('Enter');
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: '连接已创建。' })).toBeVisible();
    const before = await page.getByRole('button', { name: /^放大 \(/ }).getAttribute('aria-label');
    await page.getByRole('button', { name: /^放大 \(/ }).click();
    await expect(page.getByRole('button', { name: /^放大 \(/ })).not.toHaveAttribute('aria-label', before ?? '');
    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});
