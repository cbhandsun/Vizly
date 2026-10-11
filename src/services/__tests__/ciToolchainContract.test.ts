// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root=resolve(import.meta.dirname,'../../..');
const manifest:unknown=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
if (!manifest || typeof manifest!=='object' || Array.isArray(manifest)
  || !('packageManager' in manifest) || typeof manifest.packageManager!=='string') throw new Error('Missing package manager contract');
const manager=manifest.packageManager;
const workflow=readFileSync(resolve(root,'.github/workflows/ci.yml'),'utf8');
const setup=workflow.indexOf('run: node scripts/bootstrap-ci-npm.mjs');

describe('public CI toolchain and regression discovery contract',()=>{
  it('bootstraps the isolated declared package manager before resolving dependencies',()=>{
    expect(manager).toMatch(/^npm@12\./);
    expect(readFileSync(resolve(root,'scripts/lib/isolatedCiNpm.mjs'),'utf8')).toContain("'"+manager+"'");
    expect(setup).toBeGreaterThanOrEqual(0);
    expect(setup).toBeLessThan(workflow.indexOf('run: npm ci'));
    expect(workflow).not.toContain('run: npm install --global');
    expect(workflow).not.toContain('npm install --package-lock-only');
  });
  it('runs the unified browser entry that discovers role and pointer regressions',()=>{
    expect(workflow).toContain('phase: [main, recovery, s3]');
    expect(workflow).toContain('run: npm run test:e2e:${{ matrix.phase }}');
    expect(manifest).toMatchObject({ scripts: {
      'test:e2e:main': 'playwright test',
      'test:e2e:recovery': 'playwright test --config playwright.recovery.config.ts',
      'test:e2e:s3': 'npm run test:s3:browser',
    } });
    expect(readFileSync(resolve(root,'playwright.config.ts'),'utf8')).toContain("testDir: './e2e'");
  });
  it('requires every full-test shard, browser phase and health gate without extending the job budget',()=>{
    expect(workflow).toContain('shard: [1, 2, 3, 4]');
    expect(workflow).toContain('run: npm run test:ci -- --shard=${{ matrix.shard }}/4');
    expect(workflow).toContain('needs: [health, tests, browser, security]');
    for(const result of ['HEALTH_RESULT','TESTS_RESULT','BROWSER_RESULT','SECURITY_RESULT']) {
      expect(workflow).toContain(`test "$${result}" = success`);
    }
    expect([...workflow.matchAll(/timeout-minutes:\s*(\d+)/g)].map(match=>Number(match[1])))
      .toEqual([20,20,20,20,20]);
    for(const gate of ['typecheck','lint','test:rls','test:s3','build','collaboration:build','audit:all']) {
      expect([...workflow.matchAll(/^\s*run:\s*(.+)$/gm)].filter(match=>match[1]===`npm run ${gate}`))
        .toHaveLength(1);
    }
  });
  it('includes authenticated recovery browser regressions in the same CI entry',()=>{
    const value: unknown = JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
    expect(value).toMatchObject({ scripts: { 'test:e2e': 'playwright test && playwright test --config playwright.recovery.config.ts && npm run test:s3:browser' } });
    const config = readFileSync(resolve(root,'playwright.recovery.config.ts'),'utf8');
    expect(config).toContain("testDir: './e2e-recovery'");
    expect(config).toContain('reuseExistingServer: false');
    expect(config).toContain('https://recovery-fixture.supabase.co');
  });
  it('runs isolated S3 browser lifecycle after installing the browser and keeps credentials out of traces',()=>{
    expect(workflow.indexOf('run: npx playwright install --with-deps chromium')).toBeLessThan(workflow.indexOf('run: npm run test:e2e'));
    expect(manifest).toMatchObject({ scripts: { 'test:s3:browser': 'node scripts/check-s3-browser-integration.mjs' } });
    const config=readFileSync(resolve(root,'playwright.s3.config.ts'),'utf8');
    expect(config).toContain("testDir: './integration/browser'");
    expect(config).toContain("trace: 'off', screenshot: 'off', video: 'off'");
    expect(config).toContain('reuseExistingServer: false');
  });
});
