// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
describe('Playwright artifact ownership', () => {
  it.each([
    ['playwright.config.ts', 'main'],
    ['playwright.recovery.config.ts', 'recovery'],
  ])('isolates builds for independent %s invocations without replacing the shared preview', async (configuration, kind) => {
    const readBuild = async () => {
      const { stdout } = await run(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
        `import config from './${configuration}'; process.stdout.write(JSON.stringify({command: config.webServer.command, reuse: config.webServer.reuseExistingServer, pid: process.pid}));`],
      { cwd: process.cwd(), timeout: 10000, windowsHide: true });
      const result: unknown = JSON.parse(stdout);
      if (!result || typeof result !== 'object' || !('command' in result) || !('pid' in result) || !('reuse' in result)
        || typeof result.command !== 'string' || typeof result.pid !== 'number' || typeof result.reuse !== 'boolean') throw new Error('Invalid Playwright build configuration');
      return { command: result.command, pid: result.pid, reuse: result.reuse };
    };
    const [first, second] = await Promise.all([readBuild(), readBuild()]);
    for (const value of [first, second]) {
      const outputs = [...value.command.matchAll(/--outDir\s+(\S+)/g)].map(match => match[1]);
      expect(outputs).toEqual([`tmp/e2e-${kind}-${value.pid}`, `tmp/e2e-${kind}-${value.pid}`]);
      expect(outputs.every(output => !output.startsWith('dist/'))).toBe(true);
      expect(value.reuse).toBe(false);
    }
    expect(first.command).not.toBe(second.command);
  }, 15000);

  it('assigns different artifact directories to concurrent invocations', async () => {
    const readConfig = async () => {
      const { stdout } = await run(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
        "import config from './playwright.config.ts'; process.stdout.write(JSON.stringify({directory: config.outputDir, pid: process.pid}));"],
      { cwd: process.cwd(), timeout: 10000, windowsHide: true });
      const result: unknown = JSON.parse(stdout);
      if (!result || typeof result !== 'object' || !('directory' in result) || !('pid' in result)
        || typeof result.directory !== 'string' || typeof result.pid !== 'number') throw new Error('Invalid Playwright configuration probe');
      return { directory: result.directory, pid: result.pid };
    };
    const [first, second] = await Promise.all([readConfig(), readConfig()]);
    expect(first.directory).toBe(`./test-results/run-${first.pid}`);
    expect(second.directory).toBe(`./test-results/run-${second.pid}`);
    expect(first.directory).not.toBe(second.directory);
  }, 15000);
});
