import { describe, expect, it } from 'vitest';

import {
  assertProductionPreviewMatchesLocalBuild,
  readProductionViteAssetNames,
} from './display-routing-build-identity.mjs';

describe('display routing production build identity', () => {
  it('extracts a bounded deterministic hashed asset set', () => {
    expect(readProductionViteAssetNames(`
      <link rel="stylesheet" href="/assets/index-B.css">
      <script type="module" src="/assets/index-A.js"></script>
      <script type="module" src="/assets/index-A.js"></script>
    `)).toEqual(['index-A.js', 'index-B.css']);
  });

  it('accepts the exact local entry asset identity regardless of HTML order', () => {
    expect(assertProductionPreviewMatchesLocalBuild(
      '<script src="/assets/app-A.js"></script><link href="/assets/app-B.css">',
      '<link href="./assets/app-B.css"><script src="./assets/app-A.js"></script>',
    )).toEqual({ assetNames: ['app-A.js', 'app-B.css'] });
  });

  it.each([
    ['', '<script src="/assets/app-A.js"></script>'],
    ['<script src="/assets/old-A.js"></script>', '<script src="/assets/app-A.js"></script>'],
    ['<script src="/assets/app-A.js"></script>', '<script src="/assets/app-A.js"></script><link href="/assets/app-B.css">'],
  ])('rejects missing, stale, and incomplete preview identities', (remoteHtml, localHtml) => {
    expect(() => assertProductionPreviewMatchesLocalBuild(remoteHtml, localHtml)).toThrow();
  });

  it('rejects non-string and oversized HTML inputs', () => {
    expect(() => readProductionViteAssetNames(null)).toThrow();
    expect(() => readProductionViteAssetNames('x'.repeat(1_000_001))).toThrow();
  });
});
