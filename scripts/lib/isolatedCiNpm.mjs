import { appendFile, mkdtemp, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const contained = (root, path) => {
  const name = relative(root, path);
  return name !== '' && !isAbsolute(name) && name !== '..'
    && !name.startsWith('../') && !name.startsWith('..\\');
};
const absolutePath = value => typeof value === 'string' && value.length > 0
  && value.length <= 2048 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)
  && isAbsolute(value);
const run = (command, args) => spawnSync(command, args, {
  encoding: 'utf8', timeout: 180_000, maxBuffer: 1024 * 1024, windowsHide: true,
});

// Do not replace the CLI which is currently performing this installation.
export async function bootstrapIsolatedCiNpm(input, execute = run) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || !absolutePath(input.runnerTemp) || !absolutePath(input.githubPath)) {
    throw new Error('Invalid CI npm bootstrap paths');
  }
  const root = await realpath(resolve(input.runnerTemp));
  const pathFile = await realpath(resolve(input.githubPath));
  if (!contained(root, pathFile)) throw new Error('CI path file is outside runner temp');
  const metadata = await stat(pathFile);
  if (!metadata.isFile() || metadata.size > 1024 * 1024) throw new Error('Invalid CI path file');
  const prefix = await mkdtemp(join(root, 'vizly-npm-'));
  if (!contained(root, prefix)) throw new Error('CI npm prefix escaped runner temp');
  const install = execute('npm', ['install', '--global', '--prefix', prefix, 'npm@12.0.1']);
  if (install?.error || install?.status !== 0) throw new Error('Isolated CI npm installation failed');
  const cli = join(prefix, 'lib/node_modules/npm/bin/npm-cli.js');
  const cliFile = await realpath(cli);
  if (!contained(prefix, cliFile) || !(await stat(cliFile)).isFile()) throw new Error('Invalid isolated npm CLI');
  const bin = join(prefix, 'bin');
  const commandFile = await realpath(join(bin, 'npm'));
  if (!contained(prefix, commandFile) || !(await stat(commandFile)).isFile()) throw new Error('Invalid isolated npm command');
  const version = execute(process.execPath, [commandFile, '--version']);
  if (version?.error || version?.status !== 0 || typeof version?.stdout !== 'string'
    || version.stdout.length > 100 || version.stdout.trim() !== '12.0.1') {
    throw new Error('Isolated CI npm version verification failed');
  }
  await appendFile(pathFile, `${bin}\n`);
  return { version: '12.0.1', bin, prefix };
}
