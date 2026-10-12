// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gateProbeGroups, probeRelativePath, verifyCiNegativeGates } from './ciNegativeGateProbe.mjs';

let root;
const fixture = () => join(root, probeRelativePath);
const diagnostic = source => gateProbeGroups.flatMap(group => group.failures).find(failure => failure.source === source)?.diagnostic;
const completedGate = async () => {
  const source = await readFile(fixture(), 'utf8');
  const expected = diagnostic(source);
  return { exitCode: expected ? 1 : 0, output: expected ? `ciNegativeGateSentinel.test.ts ${expected}` : '' };
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vizly-ci-gate-test-'));
  await mkdir(dirname(fixture()), { recursive: true });
});
afterEach(async () => {
  if (!resolve(root).startsWith(resolve(tmpdir()) + '/') && !resolve(root).startsWith(resolve(tmpdir()) + '\\')) throw new Error('Unsafe test cleanup path');
  await rm(root, { recursive: true, force: true });
});

describe('CI negative gate probe ownership and result validation', () => {
  it('requires positive controls, four exact diagnostic failures and restored controls through the actual npm entries', async () => {
    const run = vi.fn(completedGate);
    const receipts = await verifyCiNegativeGates({ root, run });
    expect(receipts.map(item => item.probe)).toEqual(['test-type-error', 'explicit-any', 'conditional-hook', 'discovered-test-assertion']);
    expect(run.mock.calls.map(call => call[0])).toEqual([
      ...Array.from({ length: 3 }, () => ['run', 'typecheck']),
      ...Array.from({ length: 4 }, () => ['run', 'lint']),
      ...Array.from({ length: 3 }, () => ['run', 'test:ci', '--', probeRelativePath]),
    ]);
    await expect(readFile(fixture())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to overwrite an existing fixture', async () => {
    await writeFile(fixture(), 'existing user work');
    await expect(verifyCiNegativeGates({ root, run: completedGate })).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(fixture(), 'utf8')).toBe('existing user work');
  });

  it.each([
    ['a passing negative gate', { exitCode: 0, output: 'ciNegativeGateSentinel.test.ts TS2322' }],
    ['an unrelated gate failure', { exitCode: 1, output: 'another.ts TS2322' }],
    ['a missing expected diagnostic', { exitCode: 1, output: 'ciNegativeGateSentinel.test.ts another failure' }],
    ['an invalid exit status', { exitCode: null, output: '' }],
    ['oversized diagnostic output', { exitCode: 1, output: 'x'.repeat(2_000_001) }],
  ])('rejects %s and removes only its temporary fixture', async (_name, failure) => {
    const run = vi.fn().mockResolvedValueOnce({ exitCode: 0, output: '' }).mockResolvedValue(failure);
    await expect(verifyCiNegativeGates({ root, run })).rejects.toThrow();
    await expect(readFile(fixture())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a failing baseline or restored control', async () => {
    for (const failCall of [1, 3]) {
      let call = 0;
      const run = async () => ++call === failCall ? { exitCode: 1, output: 'control failed' } : completedGate();
      await expect(verifyCiNegativeGates({ root, run })).rejects.toThrow(/control failed/);
      await expect(readFile(fixture())).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('preserves external edits even when a gate process throws', async () => {
    const run = async () => { await writeFile(fixture(), 'concurrent user work'); throw new Error('process failure'); };
    await expect(verifyCiNegativeGates({ root, run })).rejects.toThrow('preserving it');
    expect(await readFile(fixture(), 'utf8')).toBe('concurrent user work');
  });

  it('rejects a fixture directory redirected outside the workspace', async () => {
    const other = await mkdtemp(join(root, 'external-'));
    const childRoot = join(root, 'workspace');
    const redirectedParent = join(childRoot, dirname(probeRelativePath));
    await mkdir(dirname(redirectedParent), { recursive: true });
    await symlink(other, redirectedParent, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(verifyCiNegativeGates({ root: childRoot, run: completedGate })).rejects.toThrow('escapes workspace');
    await expect(readFile(join(other, 'ciNegativeGateSentinel.test.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects relative or empty workspace roots', async () => {
    await expect(verifyCiNegativeGates({ root: '', run: completedGate })).rejects.toThrow('Invalid probe options');
    await expect(verifyCiNegativeGates({ root: '.', run: completedGate })).rejects.toThrow('Invalid probe options');
  });
});
