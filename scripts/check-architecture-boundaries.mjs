import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  compareArchitectureBoundaryBaseline,
  findForbiddenArchitectureEdges,
  findForbiddenPublicApiImports,
  findRestrictedNamedImportViolations,
  findRuntimeImportCycles,
  normalizeArchitecturePath,
  resolveProjectImport,
} from './lib/architecture-boundaries.mjs';

const projectRoot = process.cwd();
const baselinePath = path.join(projectRoot, 'scripts', 'architecture-boundary-baseline.json');
const policies = [{
  fromPrefix: 'src/core/',
  exclude: ['src/core/**/__tests__/'],
  forbiddenTargetPrefixes: [
    'src/app/',
    'src/components/',
    'src/context/',
    'src/data/',
    'src/pages/',
    'src/services/',
  ],
}, {
  fromPrefix: 'src/core/components/custom-edges/',
  forbiddenTargetPrefixes: [
    'src/core/workers/',
    'src/core/components/shared/baseReactFlowDisplayCommittedSnapshot',
    'src/core/components/shared/baseReactFlowDisplayWorker',
    'src/core/components/shared/baseReactFlowRoutingSessionRuntime',
    'src/core/services/EdgeRoutingCoordinator',
  ],
}, {
  fromPrefix: 'src/core/algorithms/',
  forbiddenTargetPrefixes: [
    'src/core/components/',
    'src/core/hooks/',
    'src/core/plugins/',
    'src/core/services/',
    'src/core/store/',
    'src/core/strategies/',
    'src/core/themes/',
    'src/core/workers/',
  ],
}, {
  fromPrefix: 'src/core/routing/',
  forbiddenTargetPrefixes: [
    'src/core/components/',
    'src/core/hooks/',
    'src/core/plugins/',
    'src/core/services/',
    'src/core/store/',
    'src/core/strategies/',
    'src/core/themes/',
    'src/core/workers/',
  ],
}, {
  fromPrefix: 'src/core/services/',
  forbiddenTargetPrefixes: [
    'src/core/components/',
    'src/core/hooks/',
    'src/core/plugins/',
    'src/core/store/',
    'src/core/themes/',
  ],
}, {
  fromPrefix: 'src/core/types/',
  forbiddenTargetPrefixes: [
    'src/core/components/',
    'src/core/hooks/',
    'src/core/plugins/',
    'src/core/services/',
    'src/core/store/',
    'src/core/strategies/',
    'src/core/themes/',
    'src/core/workers/',
  ],
}, {
  fromPrefix: 'src/core/ports/',
  forbiddenTargetPrefixes: [
    'src/core/components/',
    'src/core/hooks/',
    'src/core/plugins/',
    'src/core/services/',
    'src/core/store/',
    'src/core/strategies/',
    'src/core/themes/',
    'src/core/workers/',
  ],
}];

const gitFiles = (args) => execFileSync('git', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split(/\r?\n/)
  .map((line) => normalizeArchitecturePath(line.trim()))
  .filter(Boolean);

const sourceFiles = new Set([...new Set([
  ...gitFiles(['ls-files', '--', 'src']),
  ...gitFiles(['ls-files', '--others', '--exclude-standard', '--', 'src']),
])]
  .filter((file) => /\.(?:tsx?|jsx?)$/i.test(file) && existsSync(file)));

const fileImports = new Map();
const runtimeImportGraph = new Map();
const runtimeNamedImports = [];
const isTestFile = (file) => file.includes('/__tests__/') || /\.(?:test|spec)\.[^/]+$/i.test(file);
const hasOnlyTypeNamedBindings = (bindings) => (
  ts.isNamedImports(bindings)
  && bindings.elements.length > 0
  && bindings.elements.every((element) => element.isTypeOnly)
);

for (const file of sourceFiles) {
  if (!file.startsWith('src/core/') || file.includes('/__tests__/')) continue;
  const sourceText = readFileSync(file, 'utf8');
  const importedFiles = ts.preProcessFile(sourceText, true, true).importedFiles;
  fileImports.set(file, importedFiles.map((entry) => entry.fileName));
}

for (const file of sourceFiles) {
  if (isTestFile(file)) continue;
  const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const runtimeImports = new Set();

  for (const statement of sourceFile.statements) {
    let specifier = null;
    let typeOnly = false;
    let namedImports = [];

    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      typeOnly = Boolean(clause?.isTypeOnly || (
        clause
        && !clause.name
        && clause.namedBindings
        && hasOnlyTypeNamedBindings(clause.namedBindings)
      ));
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        namedImports = clause.namedBindings.elements
          .filter(element => !element.isTypeOnly)
          .map(element => (element.propertyName ?? element.name).text);
      }
    } else if (ts.isExportDeclaration(statement)
      && statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifier = statement.moduleSpecifier.text;
      typeOnly = Boolean(statement.isTypeOnly || (
        statement.exportClause
        && ts.isNamedExports(statement.exportClause)
        && statement.exportClause.elements.length > 0
        && statement.exportClause.elements.every((element) => element.isTypeOnly)
      ));
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        namedImports = statement.exportClause.elements
          .filter(element => !element.isTypeOnly)
          .map(element => (element.propertyName ?? element.name).text);
      }
    }

    if (!specifier || typeOnly) continue;
    const targetFile = resolveProjectImport({ fromFile: file, specifier, sourceFiles });
    if (targetFile) {
      runtimeImports.add(targetFile);
      if (namedImports.length > 0) {
        runtimeNamedImports.push({ fromFile: file, targetFile, names: namedImports });
      }
    }
  }

  runtimeImportGraph.set(file, [...runtimeImports]);
}

if (!existsSync(baselinePath)) {
  throw new Error('Architecture boundary baseline is missing.');
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (baseline?.schemaVersion !== 1 || !Array.isArray(baseline.edges) || baseline.edges.some((edge) => typeof edge !== 'string')) {
  throw new Error('Architecture boundary baseline is invalid.');
}

const actualEdges = findForbiddenArchitectureEdges({ fileImports, sourceFiles, policies });
const comparison = compareArchitectureBoundaryBaseline(actualEdges, baseline.edges);
const runtimeCycles = findRuntimeImportCycles(runtimeImportGraph);
const publicApiViolations = findForbiddenPublicApiImports({
  importGraph: runtimeImportGraph,
  entryFile: 'src/core/index.ts',
  forbiddenTargetPrefixes: ['src/core/components/', 'src/core/plugins/'],
  allowedTargets: ['src/core/plugins/builtInPlugins.ts'],
});
const restrictedNamedImportViolations = findRestrictedNamedImportViolations({
  imports: runtimeNamedImports,
  policies: [{
    targetFile: 'src/core/routing/displayRoutingRenderAuthority.ts',
    restrictedNames: ['createDisplayRoutingRenderAuthority'],
    allowedImporters: [
      'src/core/components/shared/useBaseReactFlowDisplayRenderAuthority.ts',
    ],
  }],
});

if (comparison.additions.length > 0 || comparison.removals.length > 0) {
  if (comparison.additions.length > 0) {
    console.error('New forbidden architecture dependencies:');
    comparison.additions.forEach((edge) => console.error(`  - ${edge}`));
  }
  if (comparison.removals.length > 0) {
    console.error('Resolved architecture dependencies still present in the baseline:');
    comparison.removals.forEach((edge) => console.error(`  - ${edge}`));
  }
  console.error('Core and its inward layers must not depend on app UI, data registries, or outward implementation layers.');
  console.error('Remove new violations; when debt is resolved, delete the matching baseline entries.');
  process.exit(1);
}

if (runtimeCycles.length > 0) {
  console.error('Runtime module import cycles are not allowed:');
  runtimeCycles.forEach((cycle) => {
    console.error(`  - ${cycle.join(' -> ')} -> ${cycle[0]}`);
  });
  process.exit(1);
}

if (publicApiViolations.length > 0) {
  console.error('The core public entry point must not eagerly import UI or individual plugins:');
  publicApiViolations.forEach((file) => console.error(`  - src/core/index.ts -> ${file}`));
  process.exit(1);
}

if (restrictedNamedImportViolations.length > 0) {
  console.error('Restricted routing commit capabilities have unauthorized importers:');
  restrictedNamedImportViolations.forEach(violation => console.error(`  - ${violation}`));
  process.exit(1);
}

console.log(`Architecture boundary gate passed with ${actualEdges.length} grandfathered edge(s), no new debt, no runtime import cycles, and a lightweight core public API.`);
