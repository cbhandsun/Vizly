import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const testFilePattern = /__tests__[\\/].*\.test\.(ts|tsx)$/;
const searchRoots = ['src', 'supabase'];

const normalizePath = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '');

const walk = (dir) => {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      return walk(entryPath);
    }
    return [entryPath];
  });
};

const allTests = searchRoots
  .flatMap((root) => walk(path.join(projectRoot, root)))
  .map((file) => normalizePath(path.relative(projectRoot, file)))
  .filter((file) => testFilePattern.test(file))
  .sort();

const ciShardScripts = Object.entries(packageJson.scripts ?? {})
  .filter(([name, command]) => name.startsWith('test:ci:') && typeof command === 'string')
  .map(([, command]) => command);

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

if (uncovered.length > 0 || missingDeclaredPaths.length > 0) {
  if (uncovered.length > 0) {
    console.error('Test files missing from test:ci shards:');
    for (const file of uncovered) {
      console.error(`- ${file}`);
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
