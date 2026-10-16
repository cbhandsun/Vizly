// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readJsonCheckpoint, writeJsonCheckpointAtomic } from './jsonCheckpoint.mjs';

const faults = vi.hoisted(() => ({ rename: false, write: false }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    rename: async (...args) => {
      if (faults.rename) throw Object.assign(new Error('synthetic rename failure'), { code: 'EIO' });
      return actual.rename(...args);
    },
    open: async (...args) => {
      const handle = await actual.open(...args);
      if (faults.write && args[1] === 'wx') {
        handle.writeFile = async () => { throw Object.assign(new Error('synthetic write failure'), { code: 'EIO' }); };
      }
      return handle;
    },
  };
});

const roots = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vizly-json-checkpoint-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  faults.rename = false;
  faults.write = false;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('release checkpoint boundary', () => {
  it('keeps the previous complete value visible until replacement', async () => {
    const root = await fixture();
    await writeJsonCheckpointAtomic(root, 'state.json', { status: 'running', inputs: ['one'] });
    const snapshots = [];
    for (let index = 0; index < 20; index += 1) {
      const writing = writeJsonCheckpointAtomic(root, 'state.json', { status: 'running', sequence: index, inputs: ['two'] });
      const [snapshot] = await Promise.all([readJsonCheckpoint(root, 'state.json'), writing]);
      snapshots.push(snapshot);
    }
    expect(snapshots).toHaveLength(20);
    expect(snapshots.every(item => item.status === 'running' && Array.isArray(item.inputs))).toBe(true);
    expect(await readJsonCheckpoint(root, 'state.json')).toMatchObject({ sequence: 19 });
    expect(await readdir(root)).toEqual(['state.json']);
  });

  it('reproduces the truncated legacy read and rejects it without a live writer', async () => {
    const root = await fixture();
    await writeFile(join(root, 'state.json'), '');
    await expect(readFile(join(root, 'state.json'), 'utf8').then(JSON.parse)).rejects.toBeInstanceOf(SyntaxError);
    await expect(readJsonCheckpoint(root, 'state.json')).rejects.toThrow('incomplete or invalid');
  });

  it('bounds retries for a live legacy writer rather than accepting corruption', async () => {
    const root = await fixture();
    await writeFile(join(root, 'state.json'), 'synthetic-sensitive-content');
    const probe = vi.spyOn(process, 'kill').mockImplementation(() => true);
    await expect(readJsonCheckpoint(root, 'state.json', process.pid)).rejects.toThrow('Checkpoint JSON is incomplete or invalid');
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('recovers a legacy partial write only while its declared writer is live', async () => {
    const root = await fixture();
    await writeFile(join(root, 'state.json'), '{');
    vi.useFakeTimers();
    let signal;
    const probed = new Promise(resolve => { signal = resolve; });
    const probe = vi.spyOn(process, 'kill').mockImplementation(() => { signal(); return true; });
    const reading = readJsonCheckpoint(root, 'state.json', process.pid);
    const checked = expect(reading).resolves.toEqual({ accepted: false });
    await probed;
    await writeFile(join(root, 'state.json'), '{"accepted":false}');
    await vi.advanceTimersByTimeAsync(20);
    await checked;
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it.each(['rename', 'write'])('preserves the previous checkpoint and cleans the exclusive temporary file after %s failure', async operation => {
    const root = await fixture();
    await writeJsonCheckpointAtomic(root, 'state.json', { accepted: false });
    faults[operation] = true;
    await expect(writeJsonCheckpointAtomic(root, 'state.json', { accepted: true })).rejects.toThrow('synthetic');
    expect(await readJsonCheckpoint(root, 'state.json')).toEqual({ accepted: false });
    expect(await readdir(root)).toEqual(['state.json']);
  });

  it('rejects an invalid checkpoint when the declared writer is dead', async () => {
    const root = await fixture();
    await writeFile(join(root, 'state.json'), '{');
    const probe = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('synthetic-process-detail'); });
    await expect(readJsonCheckpoint(root, 'state.json', process.pid)).rejects.toThrow('writer is not live');
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it.each([null, [], 1, 'sensitive-value', { value: Infinity }, { value: undefined }, { value: 1n }, { value: new Date() }])('rejects non-JSON data without replacing a valid checkpoint', async value => {
    const root = await fixture();
    await writeJsonCheckpointAtomic(root, 'state.json', { status: 'terminal', accepted: false });
    await expect(writeJsonCheckpointAtomic(root, 'state.json', value)).rejects.toThrow();
    expect(await readJsonCheckpoint(root, 'state.json')).toEqual({ status: 'terminal', accepted: false });
    expect(await readdir(root)).toEqual(['state.json']);
  });

  it('rejects cycles and accessors without invoking user code', async () => {
    const root = await fixture();
    const cycle = {}; cycle.self = cycle;
    await expect(writeJsonCheckpointAtomic(root, 'state.json', cycle)).rejects.toThrow('repeated references');
    const getter = vi.fn(() => 'synthetic-sensitive-content');
    await expect(writeJsonCheckpointAtomic(root, 'state.json', Object.defineProperty({}, 'data', { get: getter }))).rejects.toThrow('unsafe');
    expect(getter).not.toHaveBeenCalled();
    await expect(writeJsonCheckpointAtomic(root, 'state.json', JSON.parse('{"__proto__":{}}'))).rejects.toThrow('unsafe');
  });

  it.each(['../outside.json', '/outside.json', 'nested/state.json', 'nested\\state.json', '.env', 'state.json\u0000'])('rejects paths outside the owned filename boundary', async fileName => {
    const root = await fixture();
    await expect(writeJsonCheckpointAtomic(root, fileName, {})).rejects.toThrow('Invalid checkpoint location');
  });

  it.each([0, -1, 1.5, Infinity, '1', 2_147_483_648])('rejects invalid writer identities', async pid => {
    const root = await fixture();
    await expect(readJsonCheckpoint(root, 'state.json', pid)).rejects.toThrow('writer identity');
  });

  it('rejects oversized writes and reads', async () => {
    const root = await fixture();
    await expect(writeJsonCheckpointAtomic(root, 'state.json', { data: 'x'.repeat(8 * 1024 * 1024) })).rejects.toThrow('byte budget');
    await writeFile(join(root, 'state.json'), 'x'.repeat(8 * 1024 * 1024 + 1));
    await expect(readJsonCheckpoint(root, 'state.json')).rejects.toThrow('byte budget');
  });

  it('rejects symlink checkpoints and leaves their destination untouched', async () => {
    const root = await fixture();
    const destination = join(root, 'original.json');
    await writeFile(destination, '{"accepted":false}');
    await symlink(destination, join(root, 'state.json'));
    await expect(writeJsonCheckpointAtomic(root, 'state.json', { accepted: true })).rejects.toThrow('regular file');
    await expect(readJsonCheckpoint(root, 'state.json')).rejects.toThrow('regular file');
    expect(await readFile(destination, 'utf8')).toBe('{"accepted":false}');
  });
});
