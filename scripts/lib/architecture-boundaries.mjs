import path from 'node:path';

export const normalizeArchitecturePath = (value) => value.replace(/\\/g, '/');

const SOURCE_RESOLUTION_SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

export const resolveProjectImport = ({ fromFile, specifier, sourceFiles }) => {
  let unresolvedPath;
  if (specifier.startsWith('@/')) {
    unresolvedPath = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith('.')) {
    unresolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  } else {
    return null;
  }

  for (const suffix of SOURCE_RESOLUTION_SUFFIXES) {
    const candidate = `${unresolvedPath}${suffix}`;
    if (sourceFiles.has(candidate)) return candidate;
  }
  return null;
};

export const findForbiddenArchitectureEdges = ({ fileImports, sourceFiles, policies }) => {
  const violations = new Set();

  for (const [fromFile, specifiers] of fileImports) {
    for (const policy of policies) {
      if (!fromFile.startsWith(policy.fromPrefix)) continue;
      if (policy.exclude?.some((prefix) => fromFile.startsWith(prefix))) continue;

      for (const specifier of specifiers) {
        const targetFile = resolveProjectImport({ fromFile, specifier, sourceFiles });
        if (!targetFile || !policy.forbiddenTargetPrefixes.some((prefix) => targetFile.startsWith(prefix))) {
          continue;
        }
        violations.add(`${fromFile} -> ${targetFile}`);
      }
    }
  }

  return [...violations].sort();
};

export const compareArchitectureBoundaryBaseline = (actualEdges, baselineEdges) => {
  const actual = new Set(actualEdges);
  const baseline = new Set(baselineEdges);
  return {
    additions: [...actual].filter((edge) => !baseline.has(edge)).sort(),
    removals: [...baseline].filter((edge) => !actual.has(edge)).sort(),
  };
};

export const findRestrictedNamedImportViolations = ({ imports, policies }) => {
  const violations = new Set();
  for (const entry of imports) {
    for (const policy of policies) {
      if (
        entry.targetFile !== policy.targetFile
        || policy.allowedImporters.includes(entry.fromFile)
      ) continue;
      for (const name of entry.names) {
        if (policy.restrictedNames.includes(name)) {
          violations.add(`${entry.fromFile} -> ${entry.targetFile} [${name}]`);
        }
      }
    }
  }
  return [...violations].sort();
};

/** Finds strongly connected import groups in a directed module graph. */
export const findRuntimeImportCycles = (importGraph) => {
  let nextIndex = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];

  const visit = (file) => {
    indices.set(file, nextIndex);
    lowLinks.set(file, nextIndex);
    nextIndex += 1;
    stack.push(file);
    onStack.add(file);

    for (const dependency of importGraph.get(file) ?? []) {
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLinks.set(file, Math.min(lowLinks.get(file), indices.get(dependency)));
      }
    }

    if (lowLinks.get(file) !== indices.get(file)) return;

    const group = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      group.push(member);
    } while (member !== file);

    if (group.length > 1 || (importGraph.get(file) ?? []).includes(file)) {
      cycles.push(group.sort());
    }
  };

  for (const file of importGraph.keys()) {
    if (!indices.has(file)) visit(file);
  }

  return cycles.sort((left, right) => (
    right.length - left.length || left.join('\n').localeCompare(right.join('\n'))
  ));
};

/**
 * The root core entry point is a lightweight contract/runtime boundary. Its
 * direct imports must not pull UI modules or individual plugin implementations
 * into every consumer.
 */
export const findForbiddenPublicApiImports = ({
  importGraph,
  entryFile,
  forbiddenTargetPrefixes,
  allowedTargets = [],
}) => [...new Set(importGraph.get(entryFile) ?? [])]
  .filter((target) => (
    forbiddenTargetPrefixes.some((prefix) => target.startsWith(prefix))
    && !allowedTargets.includes(target)
  ))
  .sort();
