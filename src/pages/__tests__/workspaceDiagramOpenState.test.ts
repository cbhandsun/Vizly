import { describe, expect, it, vi } from 'vitest';

import type { UnifiedDiagramItem } from '../diagramManagementPage.helpers';
import {
  beginWorkspaceDiagramCreate,
  beginWorkspaceDiagramOpen,
  finishWorkspaceDiagramCreate,
  finishWorkspaceDiagramOpen,
  getWorkspaceDiagramOpenKey,
  navigateToCreatedWorkspaceDiagram,
} from '../workspaceDiagramOpenState';

const createItem = (overrides: Partial<UnifiedDiagramItem> = {}): UnifiedDiagramItem => ({
  id: 'diagram-1',
  title: 'Diagram',
  updatedAt: 1,
  source: 'local',
  role: 'owner',
  raw: { id: 'diagram-1' } as UnifiedDiagramItem['raw'],
  ...overrides,
});

describe('workspace diagram create state', () => {
  it('synchronously rejects repeat creation until the active operation finishes', () => {
    const lock = { active: false };

    expect(beginWorkspaceDiagramCreate(lock)).toBe(true);
    expect(lock.active).toBe(true);
    expect(beginWorkspaceDiagramCreate(lock)).toBe(false);

    expect(finishWorkspaceDiagramCreate(lock)).toBe(true);
    expect(lock.active).toBe(false);
    expect(finishWorkspaceDiagramCreate(lock)).toBe(false);
    expect(beginWorkspaceDiagramCreate(lock)).toBe(true);
  });

  it('only transfers the create lock after navigation succeeds', () => {
    const navigate = vi.fn<(diagramId: string) => void>();
    const keepLockUntilNavigation = navigateToCreatedWorkspaceDiagram(' created-id ', navigate);

    expect(keepLockUntilNavigation).toBe(true);
    expect(navigate).toHaveBeenCalledWith('created-id');
  });

  it('keeps the create lock releasable when navigation throws', () => {
    let keepLockUntilNavigation = false;

    expect(() => {
      keepLockUntilNavigation = navigateToCreatedWorkspaceDiagram('created-id', () => {
        throw new Error('navigation unavailable');
      });
    }).toThrow('navigation unavailable');

    expect(keepLockUntilNavigation).toBe(false);
  });

  it.each([null, undefined, '', '   ', '@@@'])(
    'does not navigate to an invalid created diagram id: %j',
    diagramId => {
      const navigate = vi.fn<(diagramId: string) => void>();

      expect(navigateToCreatedWorkspaceDiagram(diagramId, navigate)).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});

describe('workspace diagram open state', () => {
  it('locks one diagram until the active operation finishes', () => {
    const pending = new Set<string>();
    const item = createItem();

    const first = beginWorkspaceDiagramOpen(pending, item);
    expect(first).toEqual({ kind: 'started', key: 'local:diagram-1' });
    expect(beginWorkspaceDiagramOpen(pending, item)).toEqual({
      kind: 'duplicate',
      key: 'local:diagram-1',
    });

    expect(finishWorkspaceDiagramOpen(pending, first)).toBe(true);
    expect(beginWorkspaceDiagramOpen(pending, item)).toEqual({
      kind: 'started',
      key: 'local:diagram-1',
    });
  });

  it('keeps different sources independent and falls back to a valid raw id', () => {
    expect(getWorkspaceDiagramOpenKey(createItem({ source: 's3' }))).toBe('s3:diagram-1');
    expect(getWorkspaceDiagramOpenKey(createItem({
      id: '',
      source: 'template',
      raw: { id: 'template-raw-id' } as UnifiedDiagramItem['raw'],
    }))).toBe('template:template-raw-id');
  });

  it('does not create a lock key from empty or malformed external ids', () => {
    const pending = new Set<string>();
    const start = beginWorkspaceDiagramOpen(pending, createItem({
      id: '   ',
      raw: { id: '@@@' } as UnifiedDiagramItem['raw'],
    }));

    expect(start).toEqual({ kind: 'unkeyed' });
    expect(pending).toEqual(new Set());
    expect(finishWorkspaceDiagramOpen(pending, start)).toBe(false);
  });
});
