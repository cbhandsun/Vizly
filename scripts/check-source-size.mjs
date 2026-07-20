import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { evaluateSourceSizePolicy } from './lib/source-size-policy.mjs';

const baselineConfig = JSON.parse(readFileSync(new URL('./source-size-baseline.json', import.meta.url), 'utf8'));
const limits = baselineConfig?.limits;
if (baselineConfig?.schemaVersion !== 2
  || !limits
  || ['default', 'component', 'test', 'compositionRoot'].some((key) => !Number.isInteger(limits[key]) || limits[key] < 1)) {
  throw new Error('Invalid source-size-baseline.json schema.');
}
const oversizedBaseline = new Map(Object.entries(baselineConfig.oversizedFiles || {}));

const gitFiles = (args) => execFileSync('git', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

// Local verification must cover new modules before they are staged. Limiting
// the gate to tracked files creates a blind spot exactly while large files are
// being split into new helpers.
const sourceFiles = [...new Set([
  ...gitFiles(['ls-files', '--', 'src', 'scripts']),
  ...gitFiles(['ls-files', '--others', '--exclude-standard', '--', 'src', 'scripts']),
])]
  .filter(file => /\.(?:tsx?|jsx?|mjs|cjs)$/i.test(file) && existsSync(file))
  .sort();

const lineCounts = new Map(sourceFiles.map(file => [
  file,
  readFileSync(file, 'utf8').split(/\r?\n/).length,
]));
const failures = evaluateSourceSizePolicy({
  lineCounts,
  oversizedBaseline,
  limits,
});

if (failures.length > 0) {
  console.error([
    `Source size gate failed (${failures.length} finding${failures.length === 1 ? '' : 's'}):`,
    ...failures.map(entry => `  - ${entry}`),
    '',
    `Keep composition roots below ${limits.compositionRoot} lines, React components below ${limits.component}, ordinary modules below ${limits.default}, and tests below ${limits.test}.`,
    'For existing complex modules, reduce the baseline when extracting cohesive helpers; do not raise it without an explicit architecture review.',
  ].join('\n'));
  process.exit(1);
}

console.log(`Source size gate passed for ${sourceFiles.length} source files.`);
