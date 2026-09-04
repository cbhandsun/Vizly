import { describe, expect, it, vi } from 'vitest';

import {
  isRetryableNpmAuditNetworkTimeout,
  resolveNpmAuditCommand,
  runNpmAuditWithSingleNetworkRetry,
} from './npm-audit-retry.mjs';

const timeout = Object.freeze({
  exitCode: 1,
  signal: null,
  stdoutTail: '',
  stderrTail: [
    'npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    'npm error audit endpoint returned an error',
  ].join('\n'),
});

describe('npm audit retry boundary', () => {
  it('recognizes only the complete network-timeout fingerprint', () => {
    expect(isRetryableNpmAuditNetworkTimeout(timeout)).toBe(true);
    expect(isRetryableNpmAuditNetworkTimeout(null)).toBe(false);
    expect(isRetryableNpmAuditNetworkTimeout({ ...timeout, exitCode: 0 })).toBe(false);
    expect(isRetryableNpmAuditNetworkTimeout({ ...timeout, signal: 'SIGTERM' })).toBe(false);
    expect(isRetryableNpmAuditNetworkTimeout({
      ...timeout,
      stderrTail: 'npm error audit endpoint returned an error',
    })).toBe(false);
    expect(isRetryableNpmAuditNetworkTimeout({
      ...timeout,
      stderrTail: 'found 1 high severity vulnerability',
    })).toBe(false);
  });

  it('retries the exact timeout once and returns the retry result', async () => {
    const success = { exitCode: 0, signal: null, stdoutTail: '', stderrTail: '' };
    const runAudit = vi.fn()
      .mockResolvedValueOnce(timeout)
      .mockResolvedValueOnce(success);
    const onRetry = vi.fn();

    await expect(runNpmAuditWithSingleNetworkRetry(runAudit, onRetry)).resolves.toBe(success);
    expect(runAudit).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not retry successes, vulnerability findings, or process failures', async () => {
    for (const result of [
      { exitCode: 0, signal: null, stdoutTail: '', stderrTail: '' },
      { exitCode: 1, signal: null, stdoutTail: '1 high severity vulnerability', stderrTail: '' },
      { exitCode: null, signal: 'SIGKILL', stdoutTail: '', stderrTail: '' },
    ]) {
      const runAudit = vi.fn().mockResolvedValue(result);
      await expect(runNpmAuditWithSingleNetworkRetry(runAudit)).resolves.toBe(result);
      expect(runAudit).toHaveBeenCalledOnce();
    }
  });

  it('stops after one retry when the endpoint times out again', async () => {
    const runAudit = vi.fn().mockResolvedValue(timeout);
    await expect(runNpmAuditWithSingleNetworkRetry(runAudit)).resolves.toBe(timeout);
    expect(runAudit).toHaveBeenCalledTimes(2);
  });

  it('builds a shell-free npm CLI command and rejects invalid environment paths', () => {
    expect(resolveNpmAuditCommand({
      npmExecPath: 'C:\\npm\\bin\\npm-cli.js',
      nodeExecPath: 'C:\\node\\node.exe',
    })).toEqual({
      command: 'C:\\node\\node.exe',
      args: ['C:\\npm\\bin\\npm-cli.js', 'audit', '--omit=optional'],
    });
    expect(() => resolveNpmAuditCommand({
      npmExecPath: 'npm.cmd',
      nodeExecPath: 'C:\\node\\node.exe',
    })).toThrow('validated npm CLI path');
    expect(() => resolveNpmAuditCommand({
      npmExecPath: 'C:\\tools\\other.js',
      nodeExecPath: 'C:\\node\\node.exe',
    })).toThrow('validated npm CLI path');
  });
});
