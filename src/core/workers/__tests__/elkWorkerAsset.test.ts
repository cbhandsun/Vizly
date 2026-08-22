// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  createElkWorkerUrlModule,
  minifyElkWorkerSource,
} from '../../../../vite-plugins/elkWorkerAsset';

describe('ELK worker asset plugin', () => {
  it('creates build and development URL modules without executing input', () => {
    expect(createElkWorkerUrlModule('import.meta.ROLLUP_FILE_URL_asset')).toBe(
      'export default import.meta.ROLLUP_FILE_URL_asset;',
    );
    expect(createElkWorkerUrlModule(JSON.stringify('/@vizly/elk-engine-worker.js'))).toBe(
      'export default "/@vizly/elk-engine-worker.js";',
    );
  });

  it('minifies JavaScript and rejects empty output', async () => {
    await expect(minifyElkWorkerSource('function add(a, b) { return a + b; }', 'fixture.js'))
      .resolves.toMatch(/function \w+\([^)]*\)\{return [^}]+\}/);
    await expect(minifyElkWorkerSource('', 'empty.js')).rejects.toThrow('empty output');
  });
});
