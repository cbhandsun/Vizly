import { describe, expect, it } from 'vitest';

import {
  compareTypecheckBaseline,
  createTypecheckBaseline,
  interpretCompilerResult,
  parseTypecheckArguments,
  parseTypecheckBaselineJson,
  parseTypeScriptDiagnostics,
  parseTypecheckTimeoutMs,
  summarizeDiagnostics,
  validateTypecheckBaseline,
} from '../../../../scripts/typeScriptDiagnosticBaseline.mjs';

const projectRoot = 'C:\\workspace\\vizly';

const diagnosticOutput = (
  file = 'src/example.ts',
  line = 1,
  message = "Type 'string' is not assignable to type 'number'.",
) => `${file}(${line},2): error TS2322: ${message}`;

const parse = (output: string) => parseTypeScriptDiagnostics(output, { projectRoot }).diagnostics;

describe('typeScriptDiagnosticBaseline', () => {
  it('normalizes paths, positions, line endings, and multiline messages into stable fingerprints', () => {
    const first = parse([
      'C:\\workspace\\vizly\\src\\example.ts(10,2): error TS2322: Type string',
      '  is not assignable to number.',
      'error TS18003: No inputs were found in config file.',
    ].join('\r\n'));
    const second = parse([
      'src/example.ts(999,8): error TS2322: Type   string is not assignable to number.',
      'error TS18003: No inputs were found in config file.',
    ].join('\n'));

    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ file: 'src/example.ts', code: 2322, line: 10, column: 2 });
    expect(first[0].messageHash).toBe(second[0].messageHash);
    expect(first[1]).toMatchObject({ file: null, code: 18003 });
  });

  it('allows historical diagnostic counts to decrease', () => {
    const duplicateDiagnostics = parse([
      diagnosticOutput('src/a.ts', 1),
      diagnosticOutput('src/a.ts', 8),
    ].join('\n'));
    const baseline = createTypecheckBaseline({ 'tsconfig.app.json': duplicateDiagnostics });
    const comparison = compareTypecheckBaseline(
      baseline,
      { 'tsconfig.app.json': duplicateDiagnostics.slice(0, 1) },
      ['tsconfig.app.json'],
    );

    expect(comparison.additions).toEqual([]);
    expect(comparison.removals).toMatchObject([{ delta: 1, baselineCount: 2, currentCount: 1 }]);
  });

  it('reports a new fingerprint and a duplicate-count increase', () => {
    const existing = parse(diagnosticOutput('src/a.ts'));
    const added = parse(diagnosticOutput('src/b.ts', 1, 'A new mismatch.'));
    const baseline = createTypecheckBaseline({ app: existing });
    const comparison = compareTypecheckBaseline(
      baseline,
      { app: [...existing, ...existing, ...added] },
      ['app'],
    );

    expect(comparison.additions).toHaveLength(2);
    expect(comparison.additions.map((entry: { delta: number }) => entry.delta)).toEqual([1, 1]);
    expect(summarizeDiagnostics([...existing, ...existing])[0].count).toBe(2);
  });

  it('stores only message hashes so secret-like diagnostic literals are not persisted', () => {
    const sensitiveLiteral = 'Bearer test-placeholder-token-not-real';
    const baseline = createTypecheckBaseline({ app: parse(diagnosticOutput('src/a.ts', 1, sensitiveLiteral)) });
    const serialized = JSON.stringify(baseline);

    expect(serialized).not.toContain(sensitiveLiteral);
    expect(baseline.projects.app[0].messageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects invalid and safety-limit compiler output', () => {
    expect(() => parseTypeScriptDiagnostics(42 as unknown as string)).toThrow(/must be a string/);
    expect(() => parseTypeScriptDiagnostics('123456', { maxOutputChars: 5 })).toThrow(/safety limit/);
    expect(() => parseTypeScriptDiagnostics(
      [diagnosticOutput('src/a.ts'), diagnosticOutput('src/b.ts')].join('\n'),
      { maxDiagnosticCount: 1 },
    )).toThrow(/diagnostic safety limit/);
  });

  it('rejects malformed, duplicate, oversized, and missing-project baselines', () => {
    const valid = createTypecheckBaseline({ app: parse(diagnosticOutput()) });
    expect(() => validateTypecheckBaseline({ schemaVersion: 999, projects: {} })).toThrow(/schema version/);
    expect(() => validateTypecheckBaseline(valid, ['app', 'node'])).toThrow(/missing project node/);
    expect(() => validateTypecheckBaseline({
      ...valid,
      projects: { app: [valid.projects.app[0], valid.projects.app[0]] },
    }, ['app'])).toThrow(/duplicate diagnostic/);
    expect(() => validateTypecheckBaseline({
      ...valid,
      projects: { app: [{ ...valid.projects.app[0], count: Number.MAX_SAFE_INTEGER }] },
    }, ['app'])).toThrow(/invalid count/);
    expect(() => parseTypecheckBaselineJson('{invalid', ['app'])).toThrow(/not valid JSON/);
    expect(() => parseTypecheckBaselineJson('{}', [], { maxJsonChars: 1 })).toThrow(/safety limit/);
  });

  it('validates timeout and explicit baseline-refresh inputs', () => {
    expect(parseTypecheckTimeoutMs(undefined)).toBe(600_000);
    expect(parseTypecheckTimeoutMs('120000')).toBe(120_000);
    expect(() => parseTypecheckTimeoutMs('999')).toThrow(/between 1000 and 900000/);
    expect(() => parseTypecheckTimeoutMs('Infinity')).toThrow(/between 1000 and 900000/);
    expect(parseTypecheckArguments([])).toEqual({ writeBaseline: false });
    expect(parseTypecheckArguments(['--write-baseline'])).toEqual({ writeBaseline: true });
    expect(() => parseTypecheckArguments(['--write-baseline', '--write-baseline'])).toThrow(/Unsupported/);
    expect(() => parseTypecheckArguments(['--unknown-secret-value'])).toThrow('Unsupported typecheck gate arguments were provided');
  });

  it('accepts compiler diagnostic exits but rejects invalid and inconsistent output', () => {
    expect(interpretCompilerResult(
      { status: 2, signal: null, stdout: diagnosticOutput(), stderr: '' },
      { projectName: 'app', projectRoot },
    )).toHaveLength(1);
    expect(interpretCompilerResult(
      { status: 0, signal: null, stdout: '', stderr: '' },
      { projectName: 'app', projectRoot },
    )).toEqual([]);
    expect(() => interpretCompilerResult(
      { status: 2, signal: null, stdout: 'not a TypeScript diagnostic', stderr: '' },
      { projectName: 'app', projectRoot },
    )).toThrow(/unrecognized output|without parseable/);
    expect(() => interpretCompilerResult(
      { status: 0, signal: null, stdout: diagnosticOutput(), stderr: '' },
      { projectName: 'app', projectRoot },
    )).toThrow(/returned success/);
  });

  it('fails closed when the compiler cannot execute, times out, is killed, or exits internally', () => {
    expect(() => interpretCompilerResult(
      { status: null, signal: null, stdout: '', stderr: '', error: { code: 'ETIMEDOUT' } },
      { projectName: 'app', projectRoot },
    )).toThrow(/resource limit \(ETIMEDOUT\)/);
    expect(() => interpretCompilerResult(
      { status: null, signal: 'SIGTERM', stdout: '', stderr: '' },
      { projectName: 'app', projectRoot },
    )).toThrow(/terminated by signal/);
    expect(() => interpretCompilerResult(
      { status: 3, signal: null, stdout: '', stderr: '' },
      { projectName: 'app', projectRoot },
    )).toThrow(/unexpected exit status 3/);
  });
});
