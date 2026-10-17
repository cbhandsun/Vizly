import { expect, test } from '@playwright/test';
import { measureDirectLabelAssociation } from './support/edgeLabelAssociation';

test('direct ownership measures the actual path and rejects detached or ambiguous labels', async ({ page }) => {
  await page.setContent(`
    <svg width="600" height="400" style="position:absolute;left:0;top:0">
      <g class="react-flow__edge" data-id="owner">
        <path class="stable-path-semantic-fragment" d="M 0 100 L 500 100" />
      </g>
      <g class="react-flow__edge" data-id="foreign">
        <path class="stable-path-semantic-fragment" d="M 0 200 L 500 200" />
      </g>
    </svg>
    <div data-edge-id="owner" style="position:absolute;left:200px;top:110px;width:40px;height:20px"></div>
  `);
  const label = page.locator('div[data-edge-id]');
  const direct = await measureDirectLabelAssociation(label);
  expect(direct.ownDistance).toBeCloseTo(10);
  expect(direct.foreignDistance).toBeCloseTo(70);

  await label.evaluate(element => { element.style.top = '240px'; });
  const detached = await measureDirectLabelAssociation(label);
  expect(detached.ownDistance).toBeGreaterThan(13.5);

  await label.evaluate(element => { element.style.top = '140px'; });
  const ambiguous = await measureDirectLabelAssociation(label);
  expect(ambiguous.foreignDistance - ambiguous.ownDistance).toBeLessThan(5);

  await page.locator('path.stable-path-semantic-fragment').first().evaluate(element => element.removeAttribute('d'));
  expect((await measureDirectLabelAssociation(label)).ownDistance).toBe(Infinity);
});
