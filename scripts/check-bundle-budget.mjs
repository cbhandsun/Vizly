import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const projectRoot = resolve(process.cwd());
const assetsDir = resolve(projectRoot, 'dist/assets');

const parsePositiveNumberEnv = (name, defaultValue) => {
  const rawValue = process.env[name];
  if (!rawValue) return defaultValue;

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid positive numeric env value for ${name}: ${rawValue}`);
  }

  return parsedValue;
};

const limits = {
  maxJsChunkKB: parsePositiveNumberEnv('BUNDLE_MAX_JS_CHUNK_KB', 1500),
  maxCssChunkKB: parsePositiveNumberEnv('BUNDLE_MAX_CSS_CHUNK_KB', 150),
  maxJsGzipChunkKB: parsePositiveNumberEnv('BUNDLE_MAX_JS_GZIP_CHUNK_KB', 475),
  maxCssGzipChunkKB: parsePositiveNumberEnv('BUNDLE_MAX_CSS_GZIP_CHUNK_KB', 24),
  maxTotalJsKB: parsePositiveNumberEnv('BUNDLE_MAX_TOTAL_JS_KB', 9500),
};

const formatKB = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

if (!existsSync(resolve(projectRoot, 'dist/index.html')) || !existsSync(assetsDir)) {
  throw new Error('dist build output was not found. Run `npm run build` before checking bundle budgets.');
}

const entries = await readdir(assetsDir, { withFileTypes: true });
const assets = [];

for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith('.js') && !entry.name.endsWith('.css')) continue;

  const filePath = join(assetsDir, entry.name);
  const [fileStats, contents] = await Promise.all([
    stat(filePath),
    readFile(filePath),
  ]);
  assets.push({
    name: entry.name,
    type: entry.name.endsWith('.js') ? 'js' : 'css',
    bytes: fileStats.size,
    gzipBytes: gzipSync(contents).byteLength,
  });
}

const jsAssets = assets.filter((asset) => asset.type === 'js');
const cssAssets = assets.filter((asset) => asset.type === 'css');
const totalJsBytes = jsAssets.reduce((total, asset) => total + asset.bytes, 0);

const violations = [];
const displayWorkerAssets = jsAssets.filter(asset => (
  asset.name.startsWith('baseReactFlowDisplayEdges.worker-')
));
const legacyPathfindingWorkerAssets = jsAssets.filter(asset => (
  asset.name.startsWith('pathfinding.worker-')
));

if (displayWorkerAssets.length !== 1) {
  violations.push(
    `expected exactly one Canvas display-routing Worker asset; found ${displayWorkerAssets.length}`,
  );
}
if (legacyPathfindingWorkerAssets.length > 0) {
  violations.push(
    `legacy pathfinding Worker asset must not be emitted: ${legacyPathfindingWorkerAssets
      .map(asset => asset.name)
      .join(', ')}`,
  );
}

for (const asset of jsAssets) {
  if (asset.bytes > limits.maxJsChunkKB * 1024) {
    violations.push(`${asset.name} raw ${formatKB(asset.bytes)} > ${limits.maxJsChunkKB} KB`);
  }
  if (asset.gzipBytes > limits.maxJsGzipChunkKB * 1024) {
    violations.push(`${asset.name} gzip ${formatKB(asset.gzipBytes)} > ${limits.maxJsGzipChunkKB} KB`);
  }
}

for (const asset of cssAssets) {
  if (asset.bytes > limits.maxCssChunkKB * 1024) {
    violations.push(`${asset.name} raw ${formatKB(asset.bytes)} > ${limits.maxCssChunkKB} KB`);
  }
  if (asset.gzipBytes > limits.maxCssGzipChunkKB * 1024) {
    violations.push(`${asset.name} gzip ${formatKB(asset.gzipBytes)} > ${limits.maxCssGzipChunkKB} KB`);
  }
}

if (totalJsBytes > limits.maxTotalJsKB * 1024) {
  violations.push(`total JS raw ${formatKB(totalJsBytes)} > ${limits.maxTotalJsKB} KB`);
}

if (violations.length > 0) {
  console.error([
    `Bundle budget check failed with ${violations.length} violation(s):`,
    ...violations.map((violation) => `  - ${violation}`),
    '',
    'Override limits with BUNDLE_MAX_JS_CHUNK_KB, BUNDLE_MAX_JS_GZIP_CHUNK_KB,',
    'BUNDLE_MAX_CSS_CHUNK_KB, BUNDLE_MAX_CSS_GZIP_CHUNK_KB, or BUNDLE_MAX_TOTAL_JS_KB.',
  ].join('\n'));
  process.exit(1);
}

const largestJs = [...jsAssets].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
console.log([
  `Bundle budget passed (${jsAssets.length} JS assets, ${cssAssets.length} CSS assets, total JS ${formatKB(totalJsBytes)}).`,
  'Largest JS chunks:',
  ...largestJs.map((asset) => `  - ${asset.name}: raw ${formatKB(asset.bytes)}, gzip ${formatKB(asset.gzipBytes)}`),
].join('\n'));
