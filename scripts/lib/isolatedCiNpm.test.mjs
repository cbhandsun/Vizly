import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapIsolatedCiNpm } from './isolatedCiNpm.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const name = relative(tmpdir(), root);
    if (!name || isAbsolute(name) || name.startsWith('..')) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const runnerTemp = await mkdtemp(join(tmpdir(), 'vizly-ci-npm-test-')); roots.push(runnerTemp);
  const githubPath = join(runnerTemp, 'github-path'); await writeFile(githubPath, 'existing-path\n');
  const originalCli = join(runnerTemp, 'original-npm-cli'); await writeFile(originalCli, 'original CLI dependency tree');
  return { runnerTemp, githubPath, originalCli };
}
function successfulInstaller(commands, version = '12.0.1\n') {
  return (command, args) => {
    commands.push({ command, args });
    if (args[0] === 'install') {
      const prefix = args[args.indexOf('--prefix') + 1];
      const cli = join(prefix, 'lib/node_modules/npm/bin/npm-cli.js');
      mkdirSync(dirname(cli), { recursive: true }); writeFileSync(cli, 'isolated CLI');
      mkdirSync(join(prefix, 'bin')); writeFileSync(join(prefix, 'bin/npm'), 'isolated command');
      return { status: 0, stdout: '' };
    }
    return { status: 0, stdout: version };
  };
}
describe('isolated CI npm toolchain', () => {
  it('preserves the original CLI and activates only the verified isolated version', async () => {
    const input = await fixture(), commands = [];
    const result = await bootstrapIsolatedCiNpm(input, successfulInstaller(commands));
    expect(await readFile(input.originalCli, 'utf8')).toBe('original CLI dependency tree');
    expect(commands[0].args).toEqual(['install', '--global', '--prefix', result.prefix, 'npm@12.0.1']);
    expect(commands[1].args[0]).toBe(join(result.prefix, 'bin/npm'));
    expect(await readFile(input.githubPath, 'utf8')).toBe(`existing-path\n${result.bin}\n`);
  });
  it('allocates another prefix when a job initializes the toolchain again', async () => {
    const input = await fixture();
    const first = await bootstrapIsolatedCiNpm(input, successfulInstaller([]));
    const second = await bootstrapIsolatedCiNpm(input, successfulInstaller([]));
    expect(second.prefix).not.toBe(first.prefix);
  });
  it.each([null, undefined, [], {}, { runnerTemp: '', githubPath: '' },
    { runnerTemp: '../relative', githubPath: '/tmp/path' },
    { runnerTemp: '/tmp/invalid\npath', githubPath: '/tmp/path' },
    { runnerTemp: '/'+ 'x'.repeat(2048), githubPath: '/tmp/path' }])('rejects malformed input before executing npm: %j', async input => {
    let calls = 0;
    await expect(bootstrapIsolatedCiNpm(input, () => { calls++; })).rejects.toThrow('Invalid CI npm bootstrap paths');
    expect(calls).toBe(0);
  });
  it('rejects an output file outside the runner directory', async () => {
    const input = await fixture(), outside = await fixture();
    await expect(bootstrapIsolatedCiNpm({ ...input, githubPath: outside.githubPath }, () => {
      throw new Error('Must not execute');
    })).rejects.toThrow('outside runner temp');
  });
  it('rejects a directory or oversized PATH command file before installing', async () => {
    const input = await fixture(), directory = join(input.runnerTemp, 'directory');
    await mkdir(directory);
    await expect(bootstrapIsolatedCiNpm({ ...input, githubPath: directory })).rejects.toThrow('Invalid CI path file');
    await writeFile(input.githubPath, 'x'.repeat(1024 * 1024 + 1));
    await expect(bootstrapIsolatedCiNpm(input)).rejects.toThrow('Invalid CI path file');
  });
  it('rejects control characters in the command file path before executing', async () => {
    const input = await fixture();
    await expect(bootstrapIsolatedCiNpm({ ...input, githubPath: input.githubPath+'\n' })).rejects.toThrow('Invalid CI npm bootstrap paths');
  });
  it('rejects a CLI symlink which escapes the isolated prefix', async () => {
    const input = await fixture();
    const outside = join(input.runnerTemp, 'outside-npm');
    await mkdir(join(outside, 'bin'), { recursive: true });
    await writeFile(join(outside, 'bin/npm-cli.js'), 'outside CLI');
    await expect(bootstrapIsolatedCiNpm(input, (_command, args) => {
      const prefix = args[args.indexOf('--prefix')+1];
      mkdirSync(join(prefix, 'lib/node_modules'), { recursive: true });
      symlinkSync(outside, join(prefix, 'lib/node_modules/npm'), 'junction');
      return { status: 0 };
    })).rejects.toThrow('Invalid isolated npm CLI');
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it('rejects a successful install which did not create a CLI', async () => {
    const input = await fixture();
    await expect(bootstrapIsolatedCiNpm(input, () => ({ status: 0 }))).rejects.toThrow();
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it('does not activate an installation with a missing executable command', async () => {
    const input = await fixture();
    await expect(bootstrapIsolatedCiNpm(input, (_command, args) => {
      const prefix = args[args.indexOf('--prefix')+1];
      const cli = join(prefix, 'lib/node_modules/npm/bin/npm-cli.js');
      mkdirSync(dirname(cli), { recursive: true }); writeFileSync(cli, 'module without command');
      return { status: 0 };
    })).rejects.toThrow();
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it('does not activate PATH or expose subprocess diagnostics after install failure', async () => {
    const input = await fixture();
    await expect(bootstrapIsolatedCiNpm(input, () => ({ status: 1, stderr: 'credential-sentinel' })))
      .rejects.toThrow('Isolated CI npm installation failed');
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it.each(['10.9.4\n', '', '12.0.1\n'+'x'.repeat(100)])('rejects an unverified version without activating it: %j', async version => {
    const input = await fixture();
    await expect(bootstrapIsolatedCiNpm(input, successfulInstaller([], version))).rejects.toThrow('version verification failed');
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it.each([null, 12, {}])('rejects non-string version output: %j', async version => {
    const input = await fixture();
    await expect(bootstrapIsolatedCiNpm(input, successfulInstaller([], version))).rejects.toThrow('version verification failed');
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it('does not activate a version probe which exits unsuccessfully', async () => {
    const input = await fixture(), install = successfulInstaller([]);
    await expect(bootstrapIsolatedCiNpm(input, (command, args) => args[0] === 'install'
      ? install(command, args) : { status: 1, stdout: '12.0.1\n' })).rejects.toThrow('version verification failed');
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it('does not expose a failed spawn diagnostic', async () => {
    const input = await fixture();
    await expect(bootstrapIsolatedCiNpm(input, () => ({ status: null, error: new Error('credential-sentinel') })))
      .rejects.toThrow('Isolated CI npm installation failed');
    expect(await readFile(input.githubPath, 'utf8')).toBe('existing-path\n');
  });
  it('requires the real workflow to invoke the verified toolchain entry', async () => {
    const workflow = await readFile(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('run: node scripts/bootstrap-ci-npm.mjs');
    expect(workflow).not.toContain('run: npm install --global npm@12.0.1');
  });
});
