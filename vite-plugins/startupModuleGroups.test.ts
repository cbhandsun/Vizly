// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCanvasModuleInventory, parseEntryModuleInventory, parseStartupModuleInventory, startupModuleGroups, startupPackageModuleKey } from './startupModuleGroups';

const fixture = () => ({ schemaVersion: 1, groups: {
  common: ['react/cjs/react.production.js'], management: ['antd/es/button/index.js'], storage: ['antd/es/form/index.js'],
} });
describe('measured startup module groups', () => {
  it('leaves the management page dynamic theme outside the canvas bundle', () => {
    const canvas = startupModuleGroups.find(g => g.name === 'canvas-runtime');
    expect(canvas?.test('/repo/node_modules/@vizly/core/dist/chunks/LightTheme-DMMF1X09.js')).toBe(false);
    expect(canvas?.test('C:\\repo\\node_modules\\@vizly\\core\\dist\\chunks\\LightTheme-DMMF1X09.js')).toBe(false);
  });
  it('owns each measured canvas and entry seed exactly once while retaining strict inventory bounds', () => {
    const canvasSeeds = parseCanvasModuleInventory(JSON.parse(readFileSync(new URL('canvasModuleInventory.json', import.meta.url), 'utf8')));
    const startupSeeds = parseStartupModuleInventory(JSON.parse(readFileSync(new URL('startupModuleInventory.json', import.meta.url), 'utf8')));
    for (const group of Object.values(startupSeeds)) {
      for (const key of group) expect(canvasSeeds.has(key)).toBe(false);
    }
    for (const [name, parser, group] of [
      ['canvasModuleInventory.json', parseCanvasModuleInventory, 'canvas-runtime'],
      ['startupEntryModuleInventory.json', parseEntryModuleInventory, 'startup-entry-runtime'],
    ] as const) {
      const entries = parser(JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8')));
      for (const key of entries) {
        expect(startupModuleGroups.filter(g => g.test('/repo/node_modules/' + key)).map(g => g.name)).toEqual([group]);
      }
    }
    expect(() => parseCanvasModuleInventory({schemaVersion:1,modules:Array(2_001).fill('react/index.js')})).toThrow();
    expect(() => parseCanvasModuleInventory({schemaVersion:1,modules:['@vizly/core/src/private.js']})).toThrow();
    expect(() => parseCanvasModuleInventory({schemaVersion:1,modules:['react/index.js','react/index.js']})).toThrow();
  });
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
    expect(startupModuleGroups).toHaveLength(10);
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
  it('joins measured late canvas modules without collecting unrelated feature runtimes', () => {
    for (const name of ['TitleGroupNode', 'DomainDagreLayoutStrategy',
      'domainDagreFullEdgePreparation', 'edgeEndpointPathRepair']) {
      for (const prefix of ['/repo/node_modules/', 'C:\\repo\\node_modules\\']) {
        const id = prefix + '@vizly/core/dist/chunks/' + name + '-ABcd1234.js';
        expect(startupModuleGroups.filter(group => group.test(id)).map(group => group.name)).toEqual(['canvas-runtime']);
      }
    }
    for (const name of ['CommandPalette', 'MindMapEditor', 'AdvancedFlowchartCanvasShell', 'AdvancedFlowchartCanvasShellExtra', 'DomainDagreLayoutStrategyDebug']) {
      const id = '/repo/node_modules/@vizly/core/dist/chunks/' + name + '-ABcd1234.js';
      expect(startupModuleGroups.find(group => group.name === 'canvas-runtime')?.test(id)).toBe(false);
    }
  });
  it('keeps measured entry dependencies singly owned and rejects arbitrary virtual or private modules', () => {
    expect(startupModuleGroups.filter(g => g.test('/repo/node_modules/react/cjs/react.production.js')).map(g => g.name)).toEqual(['startup-entry-runtime']);
    expect(startupModuleGroups.filter(g => g.test('\0vite/preload-helper.js')).map(g => g.name)).toEqual(['startup-entry-runtime']);
    for (const id of ['\0vite/preload-helper.js-extra', '\0rolldown/runtime.js', '\0/repo/node_modules/react/index.js', '/repo/src/main.tsx']) {
      expect(startupModuleGroups.every(g => !g.test(id))).toBe(true);
    }
    const entry = startupModuleGroups.find(g => g.name === 'startup-entry-runtime');
    for (const id of ['/repo/node_modules/antd/es/button/index.js', '/repo/node_modules/@vizly/core/dist/react.js',
      '/repo/node_modules/@vizly/core/dist/chunks/AdvancedFlowchartCanvasShell-ABcd1234.js']) expect(entry?.test(id)).toBe(false);
  });
  it('requires a bounded canonical inventory and accepts measured ESM package files', () => {
    const modules=['react/index.js','lucide-react/dist/esm/Icon.mjs'];
    expect([...parseEntryModuleInventory({schemaVersion:1,modules})]).toEqual(modules);
    for (const value of [null,{}, {schemaVersion:2,modules}, {schemaVersion:1,modules:[]},
      {schemaVersion:1,modules,extra:true}, {schemaVersion:1,modules:Array(501).fill('react/index.js')},
      {schemaVersion:1,modules:['react/index.js','react/index.js']},
      ...['../react/index.js','react/../index.js','react/index.css','\0vite/preload-helper.js','@vizly/core/src/private.js','@vizly/core/dist/react.js'].map(key=>({schemaVersion:1,modules:[key]}))]) {
      expect(()=>parseEntryModuleInventory(value)).toThrow();
    }
  });
});
