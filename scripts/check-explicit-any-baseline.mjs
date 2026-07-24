import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { evaluateExplicitAnyPolicy } from './lib/explicit-any-policy.mjs';

const projectRoot = process.cwd();
const baselinePath = path.join(projectRoot, 'scripts', 'explicit-any-baseline.json');
const writeBaseline = process.argv.length === 3 && process.argv[2] === '--write-baseline';
if (process.argv.length > (writeBaseline ? 3 : 2)) {
  throw new Error('Usage: node scripts/check-explicit-any-baseline.mjs [--write-baseline]');
}

const gitFiles = (args) => execFileSync('git', args, {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

const isProductionTypeScript = file => (
  /\.tsx?$/i.test(file)
  && !/\.d\.ts$/i.test(file)
  && !/(?:^|\/)__tests__(?:\/|$)/.test(file)
  && !/\.(?:test|spec)\.tsx?$/i.test(file)
);

const sourceFiles = [...new Set([
  ...gitFiles(['ls-files', '--', 'src']),
  ...gitFiles(['ls-files', '--others', '--exclude-standard', '--', 'src']),
])]
  .filter(file => isProductionTypeScript(file) && existsSync(path.join(projectRoot, file)))
  .sort();

const countExplicitAny = (file) => {
  const sourceText = readFileSync(path.join(projectRoot, file), 'utf8');
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  let count = 0;
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
};

const actualCounts = new Map();
for (const file of sourceFiles) {
  const count = countExplicitAny(file);
  if (count > 0) actualCounts.set(file.replaceAll('\\', '/'), count);
}

const serializeBaseline = () => `${JSON.stringify({
  schemaVersion: 1,
  files: Object.fromEntries(actualCounts),
}, null, 2)}\n`;

if (writeBaseline) {
  const temporaryPath = `${baselinePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, serializeBaseline(), 'utf8');
  renameSync(temporaryPath, baselinePath);
  console.log(`Explicit any baseline refreshed for ${actualCounts.size} files after explicit review.`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  throw new Error('Explicit any baseline is missing; review debt and run npm run check:explicit-any:baseline.');
}
const baselineConfig = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (baselineConfig?.schemaVersion !== 1
  || !baselineConfig.files
  || typeof baselineConfig.files !== 'object'
  || Array.isArray(baselineConfig.files)) {
  throw new Error('Invalid explicit-any-baseline.json schema.');
}
const baselineCounts = new Map(Object.entries(baselineConfig.files));
for (const [file, count] of baselineCounts) {
  if (!file || !Number.isInteger(count) || count <= 0) {
    throw new Error(`Invalid explicit any baseline entry: ${file}`);
  }
}

const failures = evaluateExplicitAnyPolicy({ actualCounts, baselineCounts });
if (failures.length > 0) {
  console.error([
    `Explicit any gate failed (${failures.length} finding${failures.length === 1 ? '' : 's'}):`,
    ...failures.map(failure => `  - ${failure}`),
    '',
    'Do not add explicit any to production code; parse external values into concrete types or keep them unknown.',
    'When historical debt decreases, refresh the reviewed baseline so it cannot silently return.',
  ].join('\n'));
  process.exit(1);
}

const total = [...actualCounts.values()].reduce((sum, count) => sum + count, 0);
console.log(`Explicit any gate passed with ${total} grandfathered occurrence${total === 1 ? '' : 's'} across ${actualCounts.size} files.`);
