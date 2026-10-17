import { readFileSync } from 'node:fs';

const groupNames = ['common', 'management', 'storage'] as const;
type StartupGroupName = typeof groupNames[number];
const packageModulePattern = /^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+\/[A-Za-z0-9_./-]+\.js$/u;
const forbiddenCoreEntries = /(?:^|\/)(?:editor-ui|monaco|export|react|index)\.js$|\/(?:CommandPalette|commandPaletteStorage)(?:-[A-Za-z0-9_-]+)?\.js$/u;

export const startupPackageModuleKey = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || !raw || raw.length > 16_384
    || [...raw].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  const normalized = raw.replaceAll('\\', '/').split(/[?#]/u)[0];
  if (normalized.split('/').some(segment => segment === '..' || segment === '.')) return null;
  const marker = '/node_modules/';
  const offset = normalized.lastIndexOf(marker);
  if (offset < 0) return null;
  let key = normalized.slice(offset + marker.length);
  if (key.startsWith('@vizly/core/')) {
    if (!key.startsWith('@vizly/core/dist/') || forbiddenCoreEntries.test(key)) return null;
    if (key.startsWith('@vizly/core/dist/chunks/')) key = key.replace(/-[A-Za-z0-9_-]{8}\.js$/u, '.js');
  }
  return packageModulePattern.test(key) ? key : null;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const parseStartupModuleInventory = (value: unknown): Record<StartupGroupName, ReadonlySet<string>> => {
  if (!record(value) || value.schemaVersion !== 1 || !record(value.groups)
    || Object.keys(value).some(key => !['schemaVersion', 'groups'].includes(key))
    || Object.keys(value.groups).some(key => !groupNames.some(name => name === key))) throw new Error('Invalid startup module inventory');
  const result: Record<StartupGroupName, ReadonlySet<string>> = { common: new Set(), management: new Set(), storage: new Set() };
  const owned = new Set<string>();
  for (const name of groupNames) {
    const modules = value.groups[name];
    if (!Array.isArray(modules) || modules.length === 0 || modules.length > 1500) throw new Error('Invalid startup module inventory group');
    const entries = new Set<string>();
    for (const module of modules) {
      if (typeof module !== 'string' || module.length > 512
        || startupPackageModuleKey(`/inventory/node_modules/${module}`) !== module || owned.has(module)) {
        throw new Error('Invalid or duplicate startup module inventory member');
      }
      entries.add(module);
      owned.add(module);
    }
    result[name] = entries;
  }
  return result;
};

const inventorySource = readFileSync(new URL('./startupModuleInventory.json', import.meta.url), 'utf8');
if (inventorySource.length > 512_000) throw new Error('Startup module inventory exceeds its size limit');
const inventory: unknown = JSON.parse(inventorySource);
const modulesByGroup = parseStartupModuleInventory(inventory);
const isFrameworkModule = (key: string): boolean => /^(?:react\/|react-dom\/|scheduler\/|react-router\/|i18next\/|react-i18next\/|i18next-browser-languagedetector\/)/u.test(key);
const isAntdModule = (key: string): boolean => /^(?:antd\/|@ant-design\/|@rc-component\/|rc-[^/]+\/)/u.test(key)
  || key === '@vizly/core/dist/antd.js' || key === '@vizly/core/dist/chunks/antdStaticBridge.js';
const isCoreStartupUtility = (key: string): boolean => /^@vizly\/core\/dist\/chunks\/(?:BaseConstants|ConfigValueBoundary|applicationDiagramRuntime|boundedResponse|coerceDiagram|colorUtils|consoleCleanup|inputBoundary|jsonUtils|logSecurity|mindMapAIRuntime|performanceMonitor|persistedRoutingCandidate|remoteDiagramContent|themeLogging|uiStorageLogging)\.js$/u.test(key)
  || /^@vizly\/core\/dist\/(?:diagnostics|i18n|logging)\.js$/u.test(key);

export const startupModuleGroups = [
  {
    name: 'framework-vendor',
    test: (id: unknown): boolean => {
      const key = startupPackageModuleKey(id);
      return key !== null && isFrameworkModule(key);
    },
    entriesAware: false,
    includeDependenciesRecursively: false,
  },
  {
    name: 'antd-vendor',
    test: (id: unknown): boolean => {
      const key = startupPackageModuleKey(id);
      return key !== null && isAntdModule(key) && modulesByGroup.common.has(key);
    },
    entriesAware: false,
    includeDependenciesRecursively: false,
  },
  ...groupNames.flatMap(name => ['vendor', 'core'].map(owner => ({
  name: `startup-${name}-${owner}`,
  test: (id: unknown): boolean => {
    const key = startupPackageModuleKey(id);
    return key !== null && !isFrameworkModule(key)
      && !(isAntdModule(key) && modulesByGroup.common.has(key))
      && !(name === 'common' && owner === 'core' && !isCoreStartupUtility(key))
      && (key.startsWith('@vizly/core/') ? owner === 'core' : owner === 'vendor') && modulesByGroup[name].has(key);
  },
  // Preserve actual static reachability. Recursively collecting dependencies
  // merges lazy UI modules back into the framework's cold-start graph.
  entriesAware: false,
  includeDependenciesRecursively: false,
}))),
];
