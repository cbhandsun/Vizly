/** @typedef {Record<string, unknown>} RecordValue */
/** @param {unknown} value @returns {value is RecordValue} */
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} value @returns {RecordValue} */
const record = value => {
  if (!isRecord(value) || Object.keys(value).length > 10_000
    || Object.keys(value).some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) {
    throw new Error('Invalid Core artifact lock metadata');
  }
  return value;
};

/** @param {unknown} value @returns {string} */
const canonicalMetadata = value => {
  if (value === undefined) return '[]';
  const fields = record(value);
  return JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => {
    if (typeof entry === 'string' && entry.length <= 4096 && !/[\r\n\0]/.test(entry)) return [key, entry];
    if (isRecord(entry) && Object.keys(entry).length === 1 && typeof entry.optional === 'boolean') return [key, { optional: entry.optional }];
    throw new Error('Invalid Core dependency metadata');
  }));
};

/**
 * Creates an ephemeral npm-ci input. Every non-Core package entry is retained.
 * The caller must restore the original source files after the install.
 * @param {unknown} packageJson
 * @param {unknown} lockfile
 * @param {unknown} artifactManifest
 * @param {unknown} artifactRelativePath
 * @param {unknown} integrity
 */
export const createCoreArtifactLockOverlay = (packageJson, lockfile, artifactManifest, artifactRelativePath, integrity) => {
  const pkg = record(packageJson), lock = record(lockfile), manifest = record(artifactManifest);
  const dependencies = record(pkg.dependencies), packages = record(lock.packages);
  const root = record(packages['']), rootDependencies = record(root.dependencies);
  const core = record(packages['node_modules/@vizly/core']);
  if (pkg.name !== 'vizly-app' || lock.lockfileVersion !== 3
    || typeof dependencies['@vizly/core'] !== 'string'
    || dependencies['@vizly/core'] !== rootDependencies['@vizly/core']
    || manifest.name !== '@vizly/core' || typeof manifest.version !== 'string'
    || manifest.version.length > 128 || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(manifest.version)
    || typeof artifactRelativePath !== 'string' || !/^tmp\/ci-core-artifact-[a-f0-9]{24}\.tgz$/.test(artifactRelativePath)
    || typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)) {
    throw new Error('Invalid Core artifact install identity');
  }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'engines']) {
    if (canonicalMetadata(manifest[field]) !== canonicalMetadata(core[field])) {
      throw new Error('Core artifact dependency graph differs from the locked host');
    }
  }
  if (manifest.scripts !== undefined && ['preinstall', 'install', 'postinstall'].some(key => record(manifest.scripts)[key] !== undefined)) {
    throw new Error('Core artifact install hooks are not allowed');
  }
  const specifier = 'file:' + artifactRelativePath;
  return {
    packageJson: { ...pkg, dependencies: { ...dependencies, '@vizly/core': specifier } },
    lockfile: { ...lock, packages: { ...packages,
      '': { ...root, dependencies: { ...rootDependencies, '@vizly/core': specifier } },
      'node_modules/@vizly/core': { ...core, version: manifest.version, resolved: specifier, integrity },
    } },
  };
};
