import { expect, test, type Page } from '@playwright/test';

async function captureNodes(page: Page) {
    return page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => {
        const style = getComputedStyle(node);
        const bounds = node.getBoundingClientRect();
        const content = node.querySelector('.flowchart-node');
        const text = node.querySelector('.flowchart-node-title');
        const shape = node.querySelector('.flowchart-shape');
        return {
            id: node.getAttribute('data-id'), transform: style.transform, zIndex: style.zIndex,
            x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
            visible: [node, content, text, shape].every(element => {
                if (!element) return true;
                const paint = getComputedStyle(element);
                return paint.visibility === 'visible' && paint.display !== 'none' && Number(paint.opacity) > 0;
            }),
        };
    }));
}

for (const theme of ['light', 'dark']) {
    test(`nodes keep their position and paint throughout port dragging: ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
        await page.goto('/#/manage');
        await page.getByRole('button', { name: '新建流程图', exact: true }).click();
        await page.getByRole('button', { name: '更多操作', exact: true }).click();
        const diagram = {
            id: 'connection-visibility', name: 'Connection visibility regression', type: 'flowchart', version: '2.0.0',
            nodes: [
                { id: 'source', type: 'flowchart', label: '连接起点', metadata: { canvasPosition: { x: 100, y: 100 }, width: 180, height: 80, shape: 'rectangle' } },
                { id: 'diamond', type: 'flowchart', label: '菱形终点', metadata: { canvasPosition: { x: 520, y: 100 }, width: 180, height: 100, shape: 'diamond' } },
                { id: 'rectangle', type: 'flowchart', label: '矩形终点', metadata: { canvasPosition: { x: 520, y: 350 }, width: 180, height: 80, shape: 'rectangle' } },
            ], edges: [], layout: { direction: 'LR', generateDomainGroups: false },
        };
        const chooserPromise = page.waitForEvent('filechooser');
        await page.getByRole('menuitem', { name: '导入 JSON / Mermaid...' }).click();
        await (await chooserPromise).setFiles({ name: 'connection-visibility.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(diagram)) });
        await expect(page.locator('.react-flow__node')).toHaveCount(3);
        const library = page.getByRole('dialog', { name: '基础形状', exact: true });
        if (await library.isVisible()) await library.getByRole('button', { name: '关闭', exact: true }).click();
        if (theme === 'dark') {
            await page.getByRole('button', { name: '主题设置', exact: true }).click();
            const settings = page.locator('[data-theme-selector-dialog]');
            await settings.locator('button[data-theme-id="dark"]').click();
            await settings.getByRole('button', { name: '关闭', exact: true }).click();
        }
        await page.getByRole('button', { name: /^适应 \(/ }).click();

        for (const [index, targetId] of ['diamond', 'rectangle'].entries()) {
            const sourceNode = page.locator('.react-flow__node[data-id="source"]');
            await sourceNode.hover();
            const sourcePort = page.locator('[data-nodeid="source"][data-handleid="right"][role="button"]');
            const targetPort = page.locator(`[data-nodeid="${targetId}"][data-handleid="left"][role="button"]`);
            const start = await sourcePort.boundingBox();
            const end = await targetPort.boundingBox();
            if (!start || !end) throw new Error('Expected measurable canonical connection ports');
            const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
            const to = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
            const before = await captureNodes(page);
            expect(before.every(node => node.visible)).toBe(true);
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            expect(await captureNodes(page)).toEqual(before);
            await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
            await expect(page.locator('.react-flow__node.rf-connecting')).toHaveCount(3);
            await expect(page.locator('.react-flow__node.rf-connect-preview')).toHaveCount(1);
            await testInfo.attach(`${targetId} middle of drag`, { body: await page.screenshot({ path: testInfo.outputPath(`${targetId}-middle.png`) }), contentType: 'image/png' });
            const during = await captureNodes(page);
            await testInfo.attach(`${targetId} node geometry before and during drag`, { body: JSON.stringify({ before, during }), contentType: 'application/json' });
            expect(during).toEqual(before);
            await page.mouse.move(to.x, to.y, { steps: 6 });
            await expect(page.locator(`.react-flow__node[data-id="${targetId}"]`)).toHaveClass(/rf-connect-preview/);
            expect(await captureNodes(page)).toEqual(before);
            await testInfo.attach(`${targetId} over target port`, { body: await page.screenshot({ path: testInfo.outputPath(`${targetId}-over-target.png`) }), contentType: 'image/png' });
            await page.mouse.up();
            await expect(page.locator('.react-flow__edge')).toHaveCount(index + 1);
            await expect(page.locator('.react-flow__node.rf-connect-preview')).toHaveCount(0);
            expect(await captureNodes(page)).toEqual(before);
        }

        // Release on the source to cancel without creating a dangling edge.
        await page.locator('.react-flow__node[data-id="source"]').hover();
        const sourcePort = page.locator('[data-nodeid="source"][data-handleid="right"][role="button"]');
        const box = await sourcePort.boundingBox();
        if (!box) throw new Error('Expected source connection port');
        const beforeCancel = await captureNodes(page);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);
        expect(await captureNodes(page)).toEqual(beforeCancel);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.up();
        await expect(page.locator('.react-flow__node.rf-connecting')).toHaveCount(0);
        await expect(page.locator('.react-flow__node.rf-connect-preview')).toHaveCount(0);
        await expect(page.locator('.react-flow__edge')).toHaveCount(2);
        expect(await captureNodes(page)).toEqual(beforeCancel);
    });
}
