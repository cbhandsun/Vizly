// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseStartupModuleInventory, startupModuleGroups, startupPackageModuleKey } from './startupModuleGroups';

const fixture = () => ({ schemaVersion: 1, groups: {
  common: ['react/cjs/react.production.js'], management: ['antd/es/button/index.js'], storage: ['antd/es/form/index.js'],
} });
describe('measured startup module groups', () => {
  it('matches portable installed modules and only strips compiled SDK chunk hashes', () => {
    expect(startupPackageModuleKey('C:\\repo\\node_modules\\antd\\es\\button\\index.js?import')).toBe('antd/es/button/index.js');
    expect(startupPackageModuleKey('/repo/node_modules/@vizly/core/dist/chunks/logSecurity-ABcd1234.js')).toBe('@vizly/core/dist/chunks/logSecurity.js');
    expect(startupPackageModuleKey('/repo/node_modules/antd/es/color-A1234567.js')).toBe('antd/es/color-A1234567.js');
  });
  it('never matches private source, optional Core entries or unmeasured vendor modules', () => {
    for (const id of ['/repo/src/core/private.js', '/repo/node_modules/@vizly/core/src/private.js',
      '/repo/node_modules/@vizly/core/dist/editor-ui.js', '/repo/node_modules/@vizly/core/dist/react.js',
      '/repo/node_modules/@vizly/core/dist/chunks/CommandPalette-ABcd1234.js', '/repo/node_modules/jspdf/dist/jspdf.js',
      '/repo/node_modules/three/build/three.js']) expect(startupModuleGroups.every(group => !group.test(id))).toBe(true);
  });
  it('rejects empty, malformed, traversal, virtual and oversized module identifiers', () => {
    for (const id of [undefined, null, {}, [], 1, '', 'x'.repeat(16_385), '\0/repo/node_modules/react/index.js',
      '/repo/../node_modules/react/index.js', '/repo/node_modules/react/../index.js', '/repo/node_modules/react/./index.js',
      '/repo/node_modules/react/index.js\n', '/repo/node_modules/react/index.css']) expect(startupPackageModuleKey(id)).toBeNull();
  });
  it('parses all groups without accepting extra or duplicate ownership', () => {
    expect(parseStartupModuleInventory(fixture()).common.has('react/cjs/react.production.js')).toBe(true);
    const duplicated = fixture(); duplicated.groups.storage = [...duplicated.groups.common];
    for (const value of [undefined, null, [], {}, { ...fixture(), schemaVersion: 2 }, { ...fixture(), extra: true },
      { schemaVersion: 1, groups: { ...fixture().groups, extra: [] } }, duplicated,
      { schemaVersion: 1, groups: { ...fixture().groups, common: [] } },
      { schemaVersion: 1, groups: { ...fixture().groups, common: Array(1501).fill('react/index.js') } },
      { schemaVersion: 1, groups: { ...fixture().groups, common: ['../react/index.js'] } }]) {
      expect(() => parseStartupModuleInventory(value)).toThrow();
    }
  });
  it('limits seeds to one group without pulling lazy initialization into startup', () => {
    expect(startupModuleGroups).toHaveLength(8);
    expect(startupModuleGroups.filter(group => group.test('/repo/node_modules/react/cjs/react.production.js'))).toHaveLength(1);
    for (const group of startupModuleGroups) {
      expect(group.entriesAware).toBe(false);
      expect(group.includeDependenciesRecursively).toBe(false);
    }
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain('codeSplitting: { groups: startupModuleGroups }');
    expect(config).not.toContain('strictExecutionOrder: true');
    expect(startupModuleGroups.filter(group => group.test('/repo/node_modules/antd/es/button/index.js')).map(group => group.name)).toEqual(['antd-vendor']);
    expect(startupModuleGroups.every(group => !group.test('/repo/node_modules/@vizly/core/dist/chunks/EnhancedThemeManagerRefactored-ABcd1234.js'))).toBe(true);
  });
});
