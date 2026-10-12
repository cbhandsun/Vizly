import { open, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export const probeRelativePath = 'src/components/diagrams/hooks/__tests__/ciNegativeGateSentinel.test.ts';
const marker = 'CI_GATE_ASSERTION_SENTINEL';
const fixtureName = 'ciNegativeGateSentinel.test.ts';

export const gateProbeGroups = [
  { gate: 'typecheck', args: ['run', 'typecheck'], control: 'export const ciGateProbe: number = 1;\n',
    failures: [{ name: 'test-type-error', source: 'export const ciGateProbe: number = "CI_GATE_TYPE_SENTINEL";\n', diagnostic: 'TS2322' }] },
  { gate: 'lint', args: ['run', 'lint'], control: 'import { useState } from "react";\nexport function useCiGateProbe(_enabled: boolean) { useState(0); }\n',
    failures: [
      { name: 'explicit-any', source: 'export const ciGateProbe: any = 1;\n', diagnostic: '@typescript-eslint/no-explicit-any' },
      { name: 'conditional-hook', source: 'import { useState } from "react";\nexport function useCiGateProbe(enabled: boolean) { if (enabled) useState(0); }\n', diagnostic: 'react-hooks/rules-of-hooks' },
    ] },
  { gate: 'test:ci', args: ['run', 'test:ci', '--', probeRelativePath],
    control: `import { expect, it } from "vitest";\nit("${marker}", () => { expect(true).toBe(true); });\n`,
    failures: [{ name: 'discovered-test-assertion', source: `import { expect, it } from "vitest";\nit("${marker}", () => { expect(false).toBe(true); });\n`, diagnostic: marker }] },
];

/** @param {unknown} value */
const parseGateResult = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !('exitCode' in value) || typeof value.exitCode !== 'number' || !Number.isInteger(value.exitCode)
    || value.exitCode < 0 || value.exitCode > 255
    || !('output' in value) || typeof value.output !== 'string' || value.output.length > 2_000_000) {
    throw new Error('Invalid gate process result');
  }
  return { exitCode: value.exitCode, output: stripVTControlCharacters(value.output) };
};

/**
 * Probe only an owned temporary fixture. Normal gates remain mandatory in CI.
 * @param {{root: string, run: (args: string[]) => Promise<unknown>}} options
 */
export const verifyCiNegativeGates = async ({ root, run }) => {
  if (typeof root !== 'string' || !isAbsolute(root) || typeof run !== 'function') throw new Error('Invalid probe options');
  const approvedRoot = await realpath(root);
  const fixture = resolve(approvedRoot, probeRelativePath);
  const parent = await realpath(dirname(fixture));
  const parentRelative = relative(approvedRoot, parent);
  if (parentRelative === '..' || parentRelative.startsWith(`..${sep}`) || isAbsolute(parentRelative)) throw new Error('Probe path escapes workspace');
  const handle = await open(fixture, 'wx');
  await handle.close();
  let ownedContent = '';
  /** @param {string} next */
  const replaceOwned = async next => {
    if (await readFile(fixture, 'utf8') !== ownedContent) throw new Error('Probe fixture changed externally; preserving it');
    await writeFile(fixture, next, 'utf8');
    ownedContent = next;
  };
  const removeOwned = async () => {
    if (await readFile(fixture, 'utf8') !== ownedContent) throw new Error('Probe fixture changed externally; preserving it');
    await unlink(fixture);
  };
  /** @type {Array<{gate: string, probe: string, rejectedExitCode: number, diagnosticMatched: boolean}>} */
  const receipts = [];
  try {
    for (const group of gateProbeGroups) {
      await replaceOwned(group.control);
      const before = parseGateResult(await run([...group.args]));
      if (before.exitCode !== 0) throw new Error(`Positive control failed: ${group.gate}`);
      for (const failure of group.failures) {
        await replaceOwned(failure.source);
        const rejected = parseGateResult(await run([...group.args]));
        if (rejected.exitCode === 0 || !rejected.output.includes(fixtureName)
          || !rejected.output.includes(failure.diagnostic)) throw new Error(`Expected rejection missing: ${failure.name}`);
        receipts.push({ gate: group.gate, probe: failure.name, rejectedExitCode: rejected.exitCode, diagnosticMatched: true });
      }
      await replaceOwned(group.control);
      const after = parseGateResult(await run([...group.args]));
      if (after.exitCode !== 0) throw new Error(`Restored control failed: ${group.gate}`);
    }
    return receipts;
  } finally {
    await removeOwned();
  }
};
