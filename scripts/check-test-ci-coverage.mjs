import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TEST_CI_SHARDS } from './lib/test-ci-shards.mjs';

const projectRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const testFilePattern = /\.test\.(ts|tsx)$/;
const searchRoots = ['src', 'supabase'];

const normalizePath = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '');

const walk = (dir) => {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(entryPath);
    }
    // Test sources are regular files. Skipping links also prevents a workspace
    // junction from escaping the declared search roots or creating a cycle.
    return entry.isFile() ? [entryPath] : [];
  });
};

const allTests = searchRoots
  .flatMap((root) => walk(path.join(projectRoot, root)))
  .map((file) => normalizePath(path.relative(projectRoot, file)))
  .filter((file) => testFilePattern.test(file))
  .sort();

const packageScripts = packageJson.scripts ?? {};
const runnerShardNames = TEST_CI_SHARDS;
const missingRunnerScripts = runnerShardNames.filter((name) => typeof packageScripts[name] !== 'string');
const directVitestShardNames = Object.entries(packageScripts)
  .filter(([name, command]) => name.startsWith('test:ci:') && typeof command === 'string' && /\bvitest\s+run\b/.test(command))
  .map(([name]) => name);
const vitestShardsMissingFromRunner = directVitestShardNames.filter((name) => !runnerShardNames.includes(name));

const ciShardScripts = runnerShardNames
  .map((name) => packageScripts[name])
  .filter((command) => typeof command === 'string');

const extractVitestPaths = (command) => {
  const tokens = command.split(/\s+/).filter(Boolean);
  const paths = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--environment') {
      index += 1;
      continue;
    }
    if (token.startsWith('--')) {
      continue;
    }
    if (['vitest', 'run', 'node'].includes(token)) {
      continue;
    }
    if (token.startsWith('src/') || token.startsWith('supabase/')) {
      paths.push(normalizePath(token));
    }
  }

  return paths;
};

const ciPaths = ciShardScripts.flatMap(extractVitestPaths);
const uncovered = allTests.filter((file) => !ciPaths.some((ciPath) => file === ciPath || file.startsWith(`${ciPath}/`)));
const missingDeclaredPaths = ciPaths.filter((ciPath) => !existsSync(path.join(projectRoot, ciPath)));

if (
  uncovered.length > 0
  || missingDeclaredPaths.length > 0
  || missingRunnerScripts.length > 0
  || vitestShardsMissingFromRunner.length > 0
) {
  if (uncovered.length > 0) {
    console.error('Test files missing from test:ci shards:');
    for (const file of uncovered) {
      console.error(`- ${file}`);
    }
  }

  if (missingRunnerScripts.length > 0) {
    console.error('scripts/run-test-ci.mjs references missing package scripts:');
    for (const name of missingRunnerScripts) {
      console.error(`- ${name}`);
    }
  }

  if (vitestShardsMissingFromRunner.length > 0) {
    console.error('vitest test:ci shards are not executed by scripts/run-test-ci.mjs:');
    for (const name of vitestShardsMissingFromRunner) {
      console.error(`- ${name}`);
    }
  }

  if (missingDeclaredPaths.length > 0) {
    console.error('test:ci shard paths do not exist:');
    for (const ciPath of missingDeclaredPaths) {
      console.error(`- ${ciPath}`);
    }
  }

  process.exit(1);
}

console.log(`All ${allTests.length} test files are covered by test:ci shards.`);
