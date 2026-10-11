// @vitest-environment node
import { ESLint } from 'eslint';
import { expect, it } from 'vitest';
import configuration from '../../eslint.config.js';

const linter = new ESLint({ overrideConfigFile: true, overrideConfig: configuration });

it('excludes the compiled collaboration bundle while retaining authored file coverage', async () => {
  expect(await linter.isPathIgnored('tmp/vercel-collaboration-production/api/index.js')).toBe(true);
  for (const path of [
    'server/collaboration/vercel.ts',
    'scripts/lib/collaborationArtifactFiles.mjs',
    'tmp/authored-collaboration-helper.ts',
    'tmp/vercel-collaboration-production/api/source.ts',
  ]) {
    expect(await linter.isPathIgnored(path), path).toBe(false);
  }
});

it('continues to reject explicit any in authored application and backend inputs', async () => {
  for (const filePath of ['src/test/lintBoundaryFixture.ts', 'server/lintBoundaryFixture.ts']) {
    const results = await linter.lintText('export const fixture: any = 1;\n', { filePath });
    expect(results.flatMap(result => result.messages)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: '@typescript-eslint/no-explicit-any', severity: 2 }),
    ]));
  }
});
