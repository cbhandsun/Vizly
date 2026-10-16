// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

const root = resolve(import.meta.dirname, '../..');

describe('release gate manifest', () => {
  it('discovers the complete test suite and accepts newly added negative probes', () => {
    const command = manifest.scripts['test:ci'].split(/\s+/);
    expect(command.slice(0, 2)).toEqual(['vitest', 'run']);
    expect(command.slice(2).every(argument => /^--(?:pool|maxWorkers)=/.test(argument))).toBe(true);
    expect(manifest.scripts.test).toBe('npm run test:ci');
  });

  it('provides every npm entry referenced by the CI workflow and unified check', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
    const check = readFileSync(resolve(root, 'scripts/run-check.mjs'), 'utf8');
    const scripts: Readonly<Record<string, string>> = manifest.scripts;
    const referenced = [...workflow.matchAll(/npm run ([a-z][\w:-]*)/g)]
      .map(match => match[1]).filter(name => !name.endsWith(':'));
    const checkGates = check.match(/const gates = \[([^\]]+)\]/)?.[1] ?? '';
    referenced.push(...[...checkGates.matchAll(/'([^']+)'/g)].map(match => match[1]));
    expect(referenced.length).toBeGreaterThan(5);
    for (const name of referenced) expect(scripts[name], name).toBeTruthy();
    for (const phase of ['main', 'recovery', 's3']) expect(scripts[`test:e2e:${phase}`]).toBeTruthy();
  });

  it('declares the backend protocol dependencies and browser test tooling directly', () => {
    for (const name of ['lib0', 'y-protocols', 'ws'] as const) expect(manifest.dependencies[name]).toBeTruthy();
    expect(manifest.devDependencies['@playwright/test']).toBeTruthy();
    expect(manifest.devDependencies['@types/ws']).toBeTruthy();
    expect(existsSync(resolve(root, 'server/tsconfig.build.json'))).toBe(true);
  });
});
