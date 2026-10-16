import { expect, test, type Page } from '@playwright/test';

async function importBalanceFixture(page: Page, theme: string) {
    await page.addInitScript(mode => {
        localStorage.setItem('i18nextLng', 'zh');
        localStorage.setItem('config_theme.currentId', JSON.stringify(mode));
    }, theme);
    await page.goto('/#/manage');
    await page.getByRole('button', { name: '新建流程图', exact: true }).click();
    await page.getByRole('button', { name: '更多操作', exact: true }).click();
    const diagram = {
        id: 'visual-balance-regression', name: 'Visual balance regression', type: 'flowchart', version: '2.0.0',
        metadata: { themeId: theme }, theme: { name: theme, displayName: theme, domains: {} },
        nodes: [
            { id: 'source', type: 'flowchart', label: '订单审核', data: { style: { shadow: 'none' } }, metadata: { canvasPosition: { x: 0, y: 0 }, width: 180, height: 80, shape: 'rectangle' } },
            { id: 'target', type: 'flowchart', label: '审核通过', data: { style: { shadow: 'strong' } }, metadata: { canvasPosition: { x: 420, y: 0 }, width: 180, height: 100, shape: 'diamond' } },
            { id: 'unrelated', type: 'flowchart', label: '独立任务', metadata: { canvasPosition: { x: 0, y: 240 }, width: 180, height: 80, shape: 'rectangle' } },
        ],
        edges: [{ id: 'semantic', source: 'source', target: 'target', sourceHandle: 'right', targetHandle: 'left', label: '核验通过后继续', style: { stroke: '#fbbf24', strokeWidth: 2, strokeDasharray: '7 3' }, markerEnd: { type: 'arrowclosed', color: '#fbbf24', width: 20, height: 20 } }],
        layout: { direction: 'LR', generateDomainGroups: false },
    };
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '导入 JSON / Mermaid...' }).click();
    await (await chooserPromise).setFiles({ name: 'visual-balance.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(diagram)) });
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    const library = page.getByRole('dialog', { name: '基础形状', exact: true });
    if (await library.isVisible()) await library.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: /^适应 \(/ }).click();
    if (theme === 'dark') {
        await page.getByRole('button', { name: '主题设置', exact: true }).click();
        const settings = page.locator('[data-theme-selector-dialog]');
        await settings.locator('button[data-theme-id="dark"]').click();
        await settings.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    // A horizontal SVG stroke has a zero-height geometry box but visible paint.
    await expect(page.locator('.stable-path-semantic-fragment')).toHaveAttribute('d', /^M .+ L /);
    await expect(page.locator('.stable-path-semantic-fragment')).toHaveCSS('opacity', '1');
    await expect(page.locator('.stable-path-edge-label')).not.toHaveAttribute('data-edge-label-placement', 'pending');
    // Fit-view updates the viewport on animation frames. Snapshot the final
    // viewport and loaded fonts so hover is compared against settled geometry.
    await expect.poll(() => page.evaluate(async () => {
        await document.fonts.ready;
        const signature = () => {
            const viewport = document.querySelector('.react-flow__viewport');
            const label = document.querySelector('.stable-path-edge-label[data-edge-id="semantic"]');
            if (!viewport || !label) return null;
            const bounds = label.getBoundingClientRect();
            return JSON.stringify([viewport.getAttribute('style'), bounds.x, bounds.y, bounds.width, bounds.height]);
        };
        const before = signature();
        if (before === null) return false;
        for (let frame = 0; frame < 3; frame += 1) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            if (signature() !== before) return false;
        }
        return true;
    }), { message: 'Fit-view animation and label geometry must settle before tracing' }).toBe(true);
}

async function capturePaintAndGeometry(page: Page) {
    return page.evaluate(() => {
        const label = document.querySelector('.stable-path-edge-label[data-edge-id="semantic"]');
        if (!label) throw new Error('Expected condition label');
        const bounds = label.getBoundingClientRect();
        const viewport = document.querySelector('.react-flow__viewport');
        if (!viewport) throw new Error('Expected canvas viewport');
        const viewportBounds = viewport.getBoundingClientRect();
        return {
            nodes: [...document.querySelectorAll('.react-flow__node')].map(node => ({ id: node.getAttribute('data-id'), style: node.getAttribute('style') })),
            routes: [...document.querySelectorAll('.stable-path-semantic-fragment')].map(path => {
                const style = getComputedStyle(path);
                const marker = path.getAttribute('marker-end');
                const markerId = marker?.match(/#([^)'"]+)/u)?.[1];
                const markerNode = markerId ? document.getElementById(markerId) : null;
                return { d: path.getAttribute('d'), marker, markerWidth: markerNode?.getAttribute('markerWidth'), markerHeight: markerNode?.getAttribute('markerHeight'), stroke: style.stroke, width: style.strokeWidth, dash: style.strokeDasharray, filter: style.filter };
            }),
            // Selecting the edge opens the inspector and recenters the entire
            // viewport. Keep label geometry relative to that viewport so this
            // contract detects label drift without treating canvas reflow as it.
            label: { transform: label.getAttribute('style'), x: bounds.x - viewportBounds.x, y: bounds.y - viewportBounds.y, width: bounds.width, height: bounds.height, fontWeight: getComputedStyle(label).fontWeight, status: label.getAttribute('data-edge-label-placement'), conflicts: label.getAttribute('data-edge-label-conflicts') },
        };
    });
}

for (const theme of ['light', 'dark']) {
    test(`flowchart tracing preserves routes, labels, markers and authored styles: ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await importBalanceFixture(page, theme);
        const edge = page.locator('.react-flow__edge[data-id="semantic"]');
        const label = page.locator('.stable-path-edge-label[data-edge-id="semantic"]');
        const trace = edge.locator('.shared-trunk-accent-trace');
        const source = page.locator('.react-flow__node[data-id="source"]');
        const target = page.locator('.react-flow__node[data-id="target"]');
        const unrelated = page.locator('.react-flow__node[data-id="unrelated"]');

        await expect(source.locator('.flowchart-node')).toHaveAttribute('data-node-shadow', 'none');
        await expect(source.locator('.flowchart-node')).toHaveCSS('box-shadow', 'none');
        await expect(target.locator('.flowchart-node')).toHaveAttribute('data-node-shadow', 'strong');
        await expect(target.locator('.flowchart-node')).not.toHaveCSS('filter', 'none');
        await expect(source.locator('.flowchart-node-title')).toHaveCSS('padding-bottom', '0px');
        await expect(source.locator('.flowchart-node-title')).toHaveCSS('margin-bottom', '0px');
        await expect(trace).toHaveCSS('opacity', '0');
        const before = await capturePaintAndGeometry(page);
        expect(before.routes[0]).toMatchObject({ stroke: 'rgb(251, 191, 36)', width: '2px', markerWidth: '20', markerHeight: '20' });

        await label.hover();
        await expect(trace).toHaveCSS('opacity', '1');
        await expect(source).toHaveAttribute('data-edge-trace-role', 'source');
        await expect(target).toHaveAttribute('data-edge-trace-role', 'target');
        await expect(unrelated).not.toHaveAttribute('data-edge-trace-role');
        await expect(source.locator('.flowchart-node')).toHaveCSS('outline-width', '2px');
        expect(await capturePaintAndGeometry(page)).toEqual(before);
        // Contrast protection remains visible underneath the low contrast authored route.
        const underlays = await edge.locator('.vizly-edge-contrast-underlay:not(.shared-trunk-accent-trace-underlay)').evaluateAll(paths => paths.map(path => ({ opacity: getComputedStyle(path).opacity, ratio: Number(path.getAttribute('data-edge-contrast-underlay-ratio')) })));
        if (theme === 'light') expect(underlays.length).toBeGreaterThan(0);
        for (const underlay of underlays) {
            expect(underlay.opacity).toBe('1');
            expect(underlay.ratio).toBeGreaterThanOrEqual(3);
        }
        await testInfo.attach('label hover', { body: await page.screenshot(), contentType: 'image/png' });
        await page.mouse.move(10, 10);
        await expect(trace).toHaveCSS('opacity', '0');
        await expect(source).not.toHaveAttribute('data-edge-trace-role');
        await expect(target).not.toHaveAttribute('data-edge-trace-role');
        expect(await capturePaintAndGeometry(page)).toEqual(before);

        // SVG pointer selection and keyboard focus use the same stable trace.
        const routePoint = await edge.locator('.react-flow__edge-interaction').first().evaluate(path => {
            if (!(path instanceof SVGPathElement)) throw new Error('Expected SVG interaction path');
            const matrix = path.getScreenCTM();
            if (!matrix) throw new Error('Expected route screen transform');
            const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(matrix);
            return { x: point.x, y: point.y };
        });
        expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('.react-flow__edge')?.getAttribute('data-id'), routePoint)).toBe('semantic');
        await page.mouse.click(routePoint.x, routePoint.y);
        await expect(edge).toHaveClass(/selected/);
        await expect(trace).toHaveCSS('opacity', '1');
        await expect(label).toHaveAttribute('tabindex', '0');
        await label.press('Shift');
        await expect(label).toBeFocused();
        expect(await capturePaintAndGeometry(page)).toEqual(before);
        await page.getByRole('button', { name: '更多操作', exact: true }).focus();
        await page.keyboard.press('Escape');
        await page.locator('.react-flow__pane').click({ position: { x: 450, y: 720 } });
        await page.mouse.move(10, 10);
        await expect(trace).toHaveCSS('opacity', '0');
        await expect(source).not.toHaveAttribute('data-edge-trace-role');
        await testInfo.attach('stable paint and geometry', { body: JSON.stringify(before), contentType: 'application/json' });
    });
}
