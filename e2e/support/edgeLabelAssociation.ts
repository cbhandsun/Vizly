import type { Locator } from '@playwright/test';

/** Measure direct ownership independently of the placement status reported by Core. */
export async function measureDirectLabelAssociation(label: Locator) {
  return label.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const owner = element.getAttribute('data-edge-id');
    let ownDistance = Infinity;
    let foreignDistance = Infinity;
    for (const path of document.querySelectorAll<SVGPathElement>(
      'path.stable-path-semantic-fragment, path.shared-trunk-semantic-fragment',
    )) {
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      const scale = Math.hypot(matrix.a, matrix.b);
      const length = path.getTotalLength();
      if (!(scale > 0) || !(length > 0) || !Number.isFinite(length) || length > 100_000) continue;
      // At most one canvas unit between samples, independent of fit-view zoom.
      const steps = Math.ceil(length);
      let distance = Infinity;
      for (let i = 0; i <= steps; i++) {
        const point = path.getPointAtLength(length * i / steps).matrixTransform(matrix);
        const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
        const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
        distance = Math.min(distance, Math.hypot(dx, dy) / scale);
      }
      if (path.closest('.react-flow__edge')?.getAttribute('data-id') === owner) {
        ownDistance = Math.min(ownDistance, distance);
      } else {
        foreignDistance = Math.min(foreignDistance, distance);
      }
    }
    return { ownDistance, foreignDistance };
  });
}
