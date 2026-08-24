import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import {
  hashPrecompiledDisplayRouteSource,
  normalizePrecompiledDisplayRouteSource,
} from './precompiled-display-route-source-hash.mjs';

const ROUTING_SOURCE_SCOPES = Object.freeze([
  { directory: 'src/core/algorithms', pattern: /\.ts$/ },
  { directory: 'src/core/routing', pattern: /\.ts$/ },
  { directory: 'src/core/strategies', pattern: /\.ts$/ },
  {
    directory: 'src/core/components/shared',
    pattern: /^baseReactFlow(?:Display|Precompiled).*\.ts$/,
  },
]);

const EXPLICIT_ROUTING_SOURCES = Object.freeze([
  'src/components/diagramViewerFlowchartLoader.tsx',
  'src/core/components/diagrams/designerUtils.ts',
  'src/core/components/shared/useBaseReactFlowDisplayRouting.ts',
]);

const isProductionTypeScriptSource = path => (
  path.endsWith('.ts')
  && !path.endsWith('.test.ts')
  && !path.includes('/__tests__/')
  && !path.includes('/generated/')
);

const listFilesRecursively = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursively(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

export const hashPrecompiledDisplayRoutingSourceEntries = entries => {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('Precompiled routing source entries must be a non-empty array');
  }
  const normalized = entries.map((entry) => {
    if (
      !entry
      || typeof entry !== 'object'
      || typeof entry.path !== 'string'
      || !/^[a-zA-Z0-9_./-]+$/.test(entry.path)
      || entry.path.startsWith('/')
      || entry.path.includes('..')
      || typeof entry.source !== 'string'
    ) {
      throw new TypeError('Precompiled routing source entry is malformed');
    }
    return {
      path: entry.path.replaceAll('\\', '/'),
      source: normalizePrecompiledDisplayRouteSource(entry.source),
    };
  }).sort((first, second) => first.path.localeCompare(second.path));
  if (new Set(normalized.map(entry => entry.path)).size !== normalized.length) {
    throw new TypeError('Precompiled routing source entries contain duplicate paths');
  }
  const framed = normalized.map(entry => (
    `${entry.path.length}:${entry.path}\n${entry.source.length}:${entry.source}`
  )).join('\n');
  return hashPrecompiledDisplayRouteSource(framed);
};

export const collectPrecompiledDisplayRoutingSourceEntries = async root => {
  const absoluteRoot = resolve(root);
  const sourcePaths = new Set(EXPLICIT_ROUTING_SOURCES);
  for (const scope of ROUTING_SOURCE_SCOPES) {
    const absoluteDirectory = resolve(absoluteRoot, scope.directory);
    const files = await listFilesRecursively(absoluteDirectory);
    for (const file of files) {
      const normalizedRelativePath = relative(absoluteRoot, file).split(sep).join('/');
      const basename = normalizedRelativePath.slice(normalizedRelativePath.lastIndexOf('/') + 1);
      if (isProductionTypeScriptSource(normalizedRelativePath) && scope.pattern.test(basename)) {
        sourcePaths.add(normalizedRelativePath);
      }
    }
  }
  return Promise.all([...sourcePaths].sort().map(async path => ({
    path,
    source: await readFile(resolve(absoluteRoot, path), 'utf8'),
  })));
};

export const computePrecompiledDisplayRoutingSourceHash = async root => {
  const entries = await collectPrecompiledDisplayRoutingSourceEntries(root);
  return hashPrecompiledDisplayRoutingSourceEntries(entries);
};
