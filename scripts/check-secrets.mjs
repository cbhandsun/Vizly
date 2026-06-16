import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const textExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.sql',
  '.ts', '.tsx', '.txt', '.yml', '.yaml',
]);

const excludedPathPatterns = [
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^coverage\//,
  /^\.coverage\//,
  /^dist\//,
  /^test-results\//,
];

const allowlistPatterns = [
  /example/i,
  /placeholder/i,
  /your[-_ ]?(api[-_ ]?)?key/i,
  /test[-_ ]?(api[-_ ]?)?key/i,
  /mock[-_ ]?(api[-_ ]?)?key/i,
  /dummy/i,
];

const secretPatterns = [
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'OpenAI-style API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/ },
  { name: 'Bearer token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{32,}\b/i },
  {
    name: 'secret assignment',
    pattern: /\b(?:[a-z0-9]+[_-])*(?:api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|auth[_-]?token|refresh[_-]?token|client[_-]?secret)\b\s*[:=]\s*['"`][^'"`\s]{20,}['"`]/i,
  },
];

const hasTextExtension = (file) => {
  if (/(^|\/)\.env(?:\.|$)/i.test(file)) return true;

  const dotIndex = file.lastIndexOf('.');
  if (dotIndex === -1) return false;
  return textExtensions.has(file.slice(dotIndex).toLowerCase());
};

const shouldScan = (file) => {
  if (!hasTextExtension(file)) return false;
  return !excludedPathPatterns.some((pattern) => pattern.test(file));
};

const isAllowlisted = (line) => allowlistPatterns.some((pattern) => pattern.test(line));

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter(shouldScan)
  .filter((file) => existsSync(file));

const findings = [];

for (const file of files) {
  const contents = await readFile(file, 'utf8').catch(() => null);
  if (contents === null) continue;

  const lines = contents.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isAllowlisted(line)) return;
    for (const { name, pattern } of secretPatterns) {
      if (pattern.test(line)) {
        findings.push({ file, line: index + 1, name });
      }
    }
  });
}

if (findings.length > 0) {
  console.error([
    `Potential secret exposure detected (${findings.length} finding${findings.length === 1 ? '' : 's'}):`,
    ...findings.slice(0, 30).map(({ file, line, name }) => `  - ${file}:${line} ${name}`),
    findings.length > 30 ? `  ... and ${findings.length - 30} more` : '',
    '',
    'Remove the secret, move it to a local environment variable, or update the checker with a narrow allowlist if this is a documented placeholder.',
  ].filter(Boolean).join('\n'));
  process.exit(1);
}

console.log(`No potential secrets found in ${files.length} tracked text files.`);
