import { describe, expect, it, vi } from 'vitest';

import { createUniqueWorkspaceDiagramTitle } from '../workspaceDiagramNaming';

const translations: Record<string, string> = {
  'workspace.untitledFlowchart': '未命名流程图',
  'workspace.newArchitectureDiagram': '新建架构图',
  'workspace.newMindMap': '新建思维导图',
  'workspace.newTimeline': '新建时间线',
};

const translate = (key: string): string => translations[key] ?? key;

describe('workspace diagram naming', () => {
  it('uses localized default names for every creation type', () => {
    expect(createUniqueWorkspaceDiagramTitle({ templateKey: 'blank', translate, existingTitles: [] }))
      .toBe('未命名流程图');
    expect(createUniqueWorkspaceDiagramTitle({ templateKey: 'flowchart', translate, existingTitles: [] }))
      .toBe('未命名流程图');
    expect(createUniqueWorkspaceDiagramTitle({ templateKey: 'architecture', translate, existingTitles: [] }))
      .toBe('新建架构图');
    expect(createUniqueWorkspaceDiagramTitle({ templateKey: 'mindmap', translate, existingTitles: [] }))
      .toBe('新建思维导图');
    expect(createUniqueWorkspaceDiagramTitle({ templateKey: 'timeline', translate, existingTitles: [] }))
      .toBe('新建时间线');
  });

  it('selects the first available numeric suffix without case or Unicode-width collisions', () => {
    expect(createUniqueWorkspaceDiagramTitle({
      templateKey: 'mindmap',
      translate,
      existingTitles: ['新建思维导图', '新建思维导图 2', '新建思维导图 4'],
    })).toBe('新建思维导图 3');

    const englishTranslate = vi.fn(() => 'New Mind Map');
    expect(createUniqueWorkspaceDiagramTitle({
      templateKey: 'mindmap',
      translate: englishTranslate,
      existingTitles: ['new mind map', 'Ｎｅｗ Ｍｉｎｄ Ｍａｐ 2'],
    })).toBe('New Mind Map 3');
  });

  it('bounds malformed translations and ignores malformed existing titles', () => {
    expect(createUniqueWorkspaceDiagramTitle({
      templateKey: 'architecture',
      translate: () => `  ${'x'.repeat(400)}  `,
      existingTitles: [null, 42, {}, ''],
    })).toHaveLength(240);
    expect(createUniqueWorkspaceDiagramTitle({
      templateKey: 'timeline',
      translate: () => '   ',
      existingTitles: [],
    })).toBe('Untitled diagram');
  });

  it('keeps generated suffixes inside the title limit', () => {
    const base = 'x'.repeat(240);
    const title = createUniqueWorkspaceDiagramTitle({
      templateKey: 'mindmap',
      translate: () => base,
      existingTitles: [base],
    });

    expect(title).toHaveLength(240);
    expect(title.endsWith(' 2')).toBe(true);
  });
});
