import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateEslintWarningPolicy } from './lib/eslint-warning-policy.mjs';

const baselineConfig = JSON.parse(
  readFileSync(new URL('./eslint-warning-baseline.json', import.meta.url), 'utf8'),
);
if (baselineConfig?.schemaVersion !== 1 || typeof baselineConfig?.warnings !== 'object') {
  throw new Error('Invalid eslint-warning-baseline.json schema.');
}

const warningBaseline = new Map(Object.entries(baselineConfig.warnings));
for (const [fingerprint, count] of warningBaseline) {
  if (!fingerprint || !Number.isInteger(count) || count <= 0) {
    throw new Error(`Invalid ESLint warning baseline entry: ${fingerprint}`);
  }
}

const eslintBin = fileURLToPath(new URL('../node_modules/eslint/bin/eslint.js', import.meta.url));
const result = spawnSync(process.execPath, [
  eslintBin,
  '.',
  '--format',
  'json',
  '--cache',
  '--cache-strategy',
  'content',
  '--cache-location',
  'node_modules/.cache/eslint/.eslintcache',
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

if (result.error) {
  throw result.error;
}
if (result.signal) {
  throw new Error(`ESLint terminated by signal ${result.signal}.`);
}

let reports;
try {
  reports = JSON.parse((result.stdout || '').replace(/^\uFEFF/, ''));
} catch (error) {
  const stderr = (result.stderr || '').trim();
  throw new Error(`Unable to parse ESLint JSON output.${stderr ? ` ${stderr}` : ''}`, { cause: error });
}

const errors = [];
const warningCounts = new Map();
let warningTotal = 0;

for (const report of reports) {
  const file = relative(process.cwd(), report.filePath).replaceAll('\\', '/');
  for (const message of report.messages) {
    const rule = message.ruleId || '<none>';
    if (message.severity === 2) {
      errors.push(`${file}:${message.line ?? 1}:${message.column ?? 1} ${rule} ${message.message}`);
      continue;
    }
    if (message.severity !== 1) {
      continue;
    }

    warningTotal += 1;
    const fingerprint = `${file} :: ${rule}`;
    warningCounts.set(fingerprint, (warningCounts.get(fingerprint) || 0) + 1);
  }
}

const failures = [
  ...errors.map(error => `ESLint error: ${error}`),
  ...evaluateEslintWarningPolicy({ warningCounts, warningBaseline }),
];

if (failures.length > 0) {
  console.error([
    `ESLint gate failed (${failures.length} finding${failures.length === 1 ? '' : 's'}):`,
    ...failures.map(failure => `  - ${failure}`),
    '',
    'Fix all errors and new warning debt.',
    'When historical warnings decrease, lower or remove their exact file-and-rule baseline entries.',
  ].join('\n'));
  process.exit(1);
}

console.log(
  `ESLint gate passed with 0 errors and ${warningTotal} grandfathered warning${warningTotal === 1 ? '' : 's'}.`,
);
