import { expect, test } from '@playwright/test';

test('desktop overview retains all four cleared label associations after reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.name));
  await page.goto('/#/?diagram=wms-process-flow-v1');
  await page.locator('.react-flow__node[data-id="allocation"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
      await page.locator('.react-flow__node[data-id="allocation"]').waitFor({ state: 'attached' });
    }
    await page.getByRole('button', { name: /^适应(?:\s|\(|$)/ }).click();
    const label = page.locator('[data-edge-id="e-allocation-task"][data-edge-label-placement]');
    await expect(label).toBeVisible();
    await expect(label).toHaveAttribute('data-edge-label-placement', 'placed');
    await expect(label).not.toHaveAttribute('data-edge-label-conflicts');
    await expect(page.locator('[data-edge-id][data-edge-label-placement]')).toHaveCount(44);
    await expect(page.locator('[data-edge-id][data-edge-label-placement="unresolved"]')).toHaveCount(0).catch(async failure => {
      await testInfo.attach('unresolved label geometry', { contentType: 'application/json', body: JSON.stringify(
        await page.locator('[data-edge-id][data-edge-label-placement="unresolved"]').evaluateAll(labels => labels.map(label => ({
          edgeId: label.getAttribute('data-edge-id'), conflicts: label.getAttribute('data-edge-label-conflicts'),
          bounds: label.getBoundingClientRect().toJSON(),
        }))),
      ) });
      throw failure;
    });
    await expect.poll(() => page.evaluate(async () => {
      await document.fonts.ready;
      const signature = () => JSON.stringify([
        document.querySelector('.react-flow__viewport')?.getAttribute('style'),
        [...document.querySelectorAll('[data-edge-id][data-edge-label-placement]')].map(element => [
          element.getAttribute('style'), element.getAttribute('data-edge-label-placement'),
          element.getBoundingClientRect().toJSON(),
        ]),
        [...document.querySelectorAll('.shared-trunk-edge-interaction')].map(path => path.getAttribute('d')),
      ]);
      const before = signature();
      for (let frame = 0; frame < 3; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (signature() !== before) return false;
      }
      return true;
    }), { message: 'Loaded fonts, overview viewport, labels and canonical routes must settle' }).toBe(true);
    for (const id of ['e-allocation-task', 'e-packing-exec', 'e-sorting-exec', 'e-wcs']) {
      await expect(page.locator(`[data-edge-id="${id}"][data-edge-label-placement]`)).toHaveAttribute('data-edge-label-placement', 'placed');
      const leader = page.locator(`[data-edge-label-leader="${id}"]`);
      if (await leader.count() > 0) {
        await expect(leader).toHaveAttribute('data-edge-label-placement', 'placed');
      } else {
        // Ownership refinement can place a label directly beside its own edge.
        // Prove the association geometrically instead of requiring a leader
        // after the label already has an unambiguous direct placement.
        const association = await page.evaluate(edgeId => {
          const label = document.querySelector(`[data-edge-id="${edgeId}"][data-edge-label-placement]`);
          if (!label) throw new Error('Missing direct label');
          const rect = label.getBoundingClientRect();
          const distances = [...document.querySelectorAll<SVGPathElement>('.shared-trunk-edge-interaction')]
            .map(path => {
              const id = path.closest('.react-flow__edge')?.getAttribute('data-id');
              const transform = path.getScreenCTM();
              const length = path.getTotalLength();
              if (!id || !transform || !Number.isFinite(length) || length <= 0 || length > 100_000) {
                throw new Error('Invalid association geometry');
              }
              const zoom = Math.hypot(transform.a, transform.b);
              if (!Number.isFinite(zoom) || zoom <= 0) throw new Error('Invalid association scale');
              let distance = Infinity;
              // Half-unit sampling bounds distance error to 0.25 graph units.
              const samples = Math.ceil(length * 2);
              for (let index = 0; index <= samples; index++) {
                const point = path.getPointAtLength(length * index / samples).matrixTransform(transform);
                const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
                const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
                distance = Math.min(distance, Math.hypot(dx, dy) / zoom);
              }
              return { id, distance };
            });
          const own = distances.filter(item => item.id === edgeId);
          if (own.length !== 1 || distances.length !== 44) throw new Error('Incomplete association geometry');
          const foreign = distances.filter(item => item.id !== edgeId).sort((a, b) => a.distance - b.distance)[0];
          return { ownerAdvantage: foreign.distance - own[0].distance,
            own: own[0], nearestForeign: foreign, rect: rect.toJSON(),
            labelStyle: label.getAttribute('style'), viewport: document.querySelector('.react-flow__viewport')?.getAttribute('style') };
        }, id);
        // Retain the 6px ownership requirement with conservative sample error.
        expect(association.ownerAdvantage, JSON.stringify({ id, reload, ...association })).toBeGreaterThanOrEqual(6.5);
      }
    }
  }
  expect(pageErrors).toEqual([]);
});
