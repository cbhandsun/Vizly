import { expect, it } from 'vitest';
import { probeBrowserRuntimes } from './ciBrowserRuntime.mjs';

function engines(failure) {
  const closed = [], attempted = [], blocked = [];
  const adapters = Object.fromEntries(['chromium', 'firefox', 'webkit'].map(name => [name, {
    async launch() {
      attempted.push(name);
      if (failure === `${name}:launch`) throw Error('PRIVATE-ERROR-CANARY');
      return {
        version: () => '123.4',
        async newContext() {
          return {
            async route(pattern, handler) { await handler({ abort() { blocked.push(pattern); } }); },
            async newPage() {
              return { setDefaultTimeout() {}, async setContent() {},
                getByLabel: () => ({ async fill() {} }), getByRole: () => ({ async click() {} }),
                locator: () => ({ async textContent() { return failure === `${name}:dom` ? 'wrong' : 'vizly-browser-probe'; } }),
              };
            },
            async close() { closed.push(`${name}:context`); if (failure === `${name}:close`) throw Error('PRIVATE-ERROR-CANARY'); },
          };
        },
        async close() { closed.push(`${name}:browser`); },
      };
    },
  }]));
  return { adapters, closed, attempted, blocked };
}
it('requires successful interaction in all three engines and closes every context/browser', async () => {
  const f = engines();
  expect((await probeBrowserRuntimes(f.adapters)).status).toBe('passed');
  expect(f.closed).toHaveLength(6);
  expect(f.blocked).toEqual(['**/*', '**/*', '**/*']);
});
it.each(['launch', 'dom', 'close'])('fails closed on %s failure, retains remaining diagnoses and redacts errors', async stage => {
  const f = engines(`firefox:${stage}`), result = await probeBrowserRuntimes(f.adapters);
  expect(result.status).toBe('failed');
  expect(result.engines.map(engine => engine.status)).toEqual(['passed', 'failed', 'passed']);
  expect(f.attempted).toEqual(['chromium', 'firefox', 'webkit']);
  expect(JSON.stringify(result)).not.toContain('CANARY');
  if (stage !== 'launch') expect(f.closed).toContain('firefox:browser');
});
