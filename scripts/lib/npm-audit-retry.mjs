import { isAbsolute } from 'node:path';

const isRecord = value => typeof value === 'object' && value !== null;

const readString = (value, key) => (
  isRecord(value) && typeof value[key] === 'string' ? value[key] : ''
);

export const isRetryableNpmAuditNetworkTimeout = (result) => {
  if (!isRecord(result) || result.exitCode === 0 || result.signal != null) return false;
  const output = `${readString(result, 'stdoutTail')}\n${readString(result, 'stderrTail')}`;
  return output.includes('npm warn audit network timeout at:')
    && output.includes('npm error audit endpoint returned an error');
};

export const runNpmAuditWithSingleNetworkRetry = async (
  runAudit,
  onRetry = () => {},
) => {
  const first = await runAudit();
  if (!isRetryableNpmAuditNetworkTimeout(first)) return first;
  onRetry();
  return runAudit();
};

export const resolveNpmAuditCommand = ({ npmExecPath, nodeExecPath }) => {
  if (
    typeof npmExecPath !== 'string'
    || !isAbsolute(npmExecPath)
    || !/npm(?:-cli)?\.(?:c?js|mjs)$/i.test(npmExecPath)
    || typeof nodeExecPath !== 'string'
    || !isAbsolute(nodeExecPath)
  ) {
    throw new Error('A validated npm CLI path is required to run the audit gate.');
  }
  return {
    command: nodeExecPath,
    args: [npmExecPath, 'audit', '--omit=optional'],
  };
};
