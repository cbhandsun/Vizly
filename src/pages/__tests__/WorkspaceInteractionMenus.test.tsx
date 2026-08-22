// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceDiagramCollection } from '../WorkspaceDiagramCollection';
import { WorkspaceCompactHeader } from '../WorkspaceCompactHeader';
import { WorkspaceContextMenu } from '../WorkspaceContextMenu';
import { WorkspaceGlobalHeader } from '../WorkspaceGlobalHeader';
import type {
  FilterViewType,
  SortKey,
  UnifiedDiagramItem,
  ViewMode,
} from '../diagramManagementPage.helpers';
import {
  beginWorkspaceDeleteDialog,
  coerceWorkspaceDeleteTargetName,
  createWorkspaceDeleteConfirmation,
  finishWorkspaceDeleteDialog,
  type WorkspaceDeleteConfirmationOptions,
} from '../workspaceDeleteConfirmation';
import {
  clampWorkspaceMenuPosition,
  focusWorkspaceTarget,
  getNextWorkspaceMenuIndex,
} from '../workspaceMenuInteraction';

const themeMock = vi.hoisted(() => ({
  current: { mode: 'light' as 'light' | 'dark' },
  setTheme: vi.fn(),
}));

vi.mock('@/core/themes/useCoreTheme', () => ({
  useTheme: () => [themeMock.current, themeMock.setTheme],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string; view?: string }) => {
      const values: Record<string, string> = {
        'common.delete': 'Delete',
        'common.open': 'Open',
        'workspace.recent': 'Recent',
        'workspace.local': 'Local',
        'workspace.cloud': 'Cloud',
        'workspace.shared': 'Shared',
        'workspace.industryTemplates': 'Industry templates',
        'workspace.generalTemplates': 'General templates',
        'workspace.lastModified': 'Last modified',
        'workspace.name': 'Name',
        'workspace.type': 'Type',
        'workspace.sortBy': 'Sort diagrams',
        'workspace.filterBy': 'Filter diagrams',
        'workspace.viewMode': 'Diagram view',
        'workspace.gridView': 'Grid view',
        'workspace.listView': 'List view',
        'workspace.viewRecent': 'View recent diagrams',
        'workspace.empty.filterTitle': `No diagrams in ${options?.view ?? ''}`,
        'workspace.empty.filterDescription': `The ${options?.view ?? ''} view is empty.`,
        'workspace.openInNewTab': 'Open in new tab',
        'workspace.title': 'Workspace',
        'workspace.documentCount': '1 diagram',
        'workspace.newFlowchart': 'New flowchart',
        'workspace.creatingDiagram': 'Creating diagram…',
        'workspace.chooseDiagramType': 'Choose a diagram type',
        'workspace.diagramTypes.mindmap': 'Mind map',
        'workspace.diagramTypes.timeline': 'Timeline',
        'workspace.diagramTypes.architecture': 'Architecture',
        'workspace.diagramTypeDescriptions.mindmap': 'Map ideas and relationships',
        'workspace.diagramTypeDescriptions.timeline': 'Plan milestones and schedules',
        'workspace.diagramTypeDescriptions.architecture': 'Model systems and dependencies',
        'workspace.goHome': 'Go to workspace',
        'workspace.search': 'Search workspace',
        'workspace.searchPlaceholder': 'Find your diagrams...',
        'workspace.clearSearch': 'Clear search',
        'workspace.searchResultsStatus': '1 matching diagram',
        'workspace.searchNoResultsStatus': 'No matching diagrams',
        'workspace.settings': 'Settings',
        'workspace.toggleTheme': 'Toggle theme',
        'designer.menu.theme.light': 'Light',
        'designer.menu.theme.dark': 'Dark',
      };
      if (key === 'workspace.moreActions') return `More actions for ${options?.title ?? ''}`;
      return values[key] ?? key;
    },
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});

const item: UnifiedDiagramItem = {
  id: 'diagram-1',
  title: 'Commercial flow',
  updatedAt: 1,
  source: 'local',
  role: 'owner',
  raw: { id: 'diagram-1' } as UnifiedDiagramItem['raw'],
};

const WorkspaceControlsHarness = () => {
  const [activeView, setActiveView] = useState<FilterViewType>('cloud');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  return (
    <WorkspaceDiagramCollection
      activeView={activeView}
      onActiveViewChange={setActiveView}
      unifiedItems={[item]}
      loadedInventoryScopes={new Set(['documents', 'templates'])}
      filteredItems={[]}
      sortKey={sortKey}
      onSortKeyChange={setSortKey}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      loading={false}
      loadFailure={null}
      onRetryLoad={() => undefined}
      openingDiagramKeys={new Set()}
      onOpenDiagram={vi.fn()}
      onOpenDiagramInNewTab={vi.fn()}
      onContextMenu={vi.fn()}
      onDeleteDiagram={vi.fn()}
      onCreateBlank={vi.fn()}
      searchQuery=""
      onClearSearch={vi.fn()}
    />
  );
};

const WorkspaceCardMenuHarness = ({
  viewMode = 'grid',
  items = [item],
}: {
  viewMode?: ViewMode;
  items?: UnifiedDiagramItem[];
}) => (
  <WorkspaceDiagramCollection
    activeView="recent"
    onActiveViewChange={vi.fn()}
    unifiedItems={items}
    loadedInventoryScopes={new Set(['documents', 'templates'])}
    filteredItems={items}
    sortKey="updated"
    onSortKeyChange={vi.fn()}
    viewMode={viewMode}
    onViewModeChange={vi.fn()}
    loading={false}
    loadFailure={null}
    onRetryLoad={() => undefined}
    openingDiagramKeys={new Set()}
    onOpenDiagram={vi.fn()}
    onOpenDiagramInNewTab={vi.fn()}
    onContextMenu={vi.fn()}
    onDeleteDiagram={vi.fn()}
    onCreateBlank={vi.fn()}
    searchQuery=""
    onClearSearch={vi.fn()}
  />
);

afterEach(() => {
  document.body.replaceChildren();
  themeMock.current = { mode: 'light' };
  themeMock.setTheme.mockReset();
});

describe('WorkspaceContextMenu', () => {
  it('provides menu semantics, roving keyboard focus, and Escape focus restoration', async () => {
    const origin = document.createElement('button');
    origin.textContent = 'Diagram card';
    document.body.append(origin);
    origin.focus();
    const onDismiss = vi.fn();

    render(
      <WorkspaceContextMenu
        x={Number.POSITIVE_INFINITY}
        y={-100}
        item={item}
        returnFocusTarget={origin}
        onOpen={vi.fn()}
        onOpenInNewTab={vi.fn()}
        onDelete={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    const menu = screen.getByRole('menu', { name: 'More actions for Commercial flow' });
    const open = screen.getByRole('menuitem', { name: 'Open' });
    const openInNewTab = screen.getByRole('menuitem', { name: 'Open in new tab' });
    const deleteItem = screen.getByRole('menuitem', { name: 'Delete' });

    await waitFor(() => expect(document.activeElement).toBe(open));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(openInNewTab);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(deleteItem);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(open);

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(origin));
  });

  it('passes the original card target into the destructive action', () => {
    const origin = document.createElement('button');
    document.body.append(origin);
    const onDelete = vi.fn();

    render(
      <WorkspaceContextMenu
        x={10}
        y={10}
        item={item}
        returnFocusTarget={origin}
        onOpen={vi.fn()}
        onOpenInNewTab={vi.fn()}
        onDelete={onDelete}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(expect.anything(), item, origin);
  });
});

describe('WorkspaceDiagramCollection controls', () => {
  it('uses a roving tab stop and activates adjacent filters with horizontal navigation keys', async () => {
    render(<WorkspaceControlsHarness />);

    const cloud = screen.getByRole('button', { name: /Cloud/ });
    const shared = screen.getByRole('button', { name: /Shared/ });
    const recent = screen.getByRole('button', { name: /Recent/ });
    const generalTemplates = screen.getByRole('button', { name: /General templates/ });

    expect(cloud).toHaveAttribute('tabindex', '0');
    expect(shared).toHaveAttribute('tabindex', '-1');
    cloud.focus();
    fireEvent.keyDown(cloud, { key: 'ArrowRight' });
    expect(shared).toHaveAttribute('aria-pressed', 'true');
    expect(shared).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(shared);

    fireEvent.keyDown(shared, { key: 'End' });
    expect(generalTemplates).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(generalTemplates);

    fireEvent.keyDown(generalTemplates, { key: 'ArrowRight' });
    expect(recent).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(recent);

    fireEvent.keyDown(recent, { key: 'ArrowDown' });
    expect(recent).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(recent);
  });

  it('recovers an empty filtered view to Recent and restores focus to that filter', async () => {
    render(<WorkspaceControlsHarness />);

    expect(screen.getByRole('heading', { name: 'No diagrams in Cloud' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View recent diagrams' }));

    const recent = screen.getByRole('button', { name: /Recent/ });
    expect(recent).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(document.activeElement).toBe(recent));
  });

  it.each(['Enter', ' ', 'ArrowDown'])('opens the named sort menu with %j and moves focus into it', async key => {
    render(<WorkspaceControlsHarness />);
    const trigger = screen.getByRole('button', { name: 'Sort diagrams: Last modified' });

    trigger.focus();
    fireEvent.keyDown(trigger, { key });

    const menu = await screen.findByRole('menu', { name: 'Sort diagrams' });
    const firstItem = screen.getByRole('menuitem', { name: 'Last modified' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(document.activeElement).toBe(firstItem));

    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it.each(['Enter', ' ', 'ArrowDown'])(
    'opens the named card actions menu with %j and restores focus on Escape',
    async key => {
      render(<WorkspaceCardMenuHarness />);
      const trigger = screen.getByRole('button', { name: 'More actions for Commercial flow' });
      const menuId = trigger.getAttribute('aria-controls');

      expect(menuId).toMatch(/^workspace-card-actions-menu-/);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      trigger.focus();
      fireEvent.keyDown(trigger, { key });

      const menu = await screen.findByRole('menu', { name: 'More actions for Commercial flow' });
      const firstItem = screen.getByRole('menuitem', { name: 'Open in new tab' });
      expect(menu).toHaveAttribute('id', menuId);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(document.activeElement).toBe(firstItem));

      fireEvent.keyDown(menu, { key: 'Escape' });
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    },
  );

  it('keeps the list-view card actions menu on the same keyboard contract', async () => {
    render(<WorkspaceCardMenuHarness viewMode="list" />);
    const trigger = screen.getByRole('button', { name: 'More actions for Commercial flow' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const menu = await screen.findByRole('menu', { name: 'More actions for Commercial flow' });
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Open in new tab' }),
    ));
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes a previous card menu when another card menu opens', async () => {
    const secondItem: UnifiedDiagramItem = {
      ...item,
      id: 'diagram-2',
      title: 'Secondary flow',
      raw: { id: 'diagram-2' } as UnifiedDiagramItem['raw'],
    };
    render(<WorkspaceCardMenuHarness items={[item, secondItem]} />);
    const firstTrigger = screen.getByRole('button', { name: 'More actions for Commercial flow' });
    const secondTrigger = screen.getByRole('button', { name: 'More actions for Secondary flow' });

    fireEvent.keyDown(firstTrigger, { key: 'ArrowDown' });
    expect(await screen.findByRole('menu', { name: 'More actions for Commercial flow' })).toBeTruthy();

    fireEvent.keyDown(secondTrigger, { key: 'ArrowDown' });
    const secondMenu = await screen.findByRole('menu', { name: 'More actions for Secondary flow' });
    await waitFor(() => {
      expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
      expect(secondTrigger).toHaveAttribute('aria-expanded', 'true');
      expect(document.activeElement).toBe(
        within(secondMenu).getByRole('menuitem', { name: 'Open in new tab' }),
      );
    });
    expect(secondMenu).toHaveAttribute('id', secondTrigger.getAttribute('aria-controls'));
  });
});

describe('WorkspaceCompactHeader create menu', () => {
  it('disables every create entry and exposes progress while creation is pending', () => {
    const onCreateTemplate = vi.fn();
    render(
      <WorkspaceCompactHeader
        documentCount={1}
        isCreating
        onCreateTemplate={onCreateTemplate}
      />,
    );

    const primary = screen.getByRole('button', { name: 'Creating diagram…' });
    const secondary = screen.getByRole('button', { name: 'Choose a diagram type' });
    expect(primary).toBeDisabled();
    expect(primary).toHaveAttribute('aria-busy', 'true');
    expect(secondary).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Creating diagram…');

    fireEvent.click(primary);
    fireEvent.click(secondary);
    expect(onCreateTemplate).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu', { name: 'Choose a diagram type' })).toBeNull();
  });

  it.each(['Enter', ' ', 'ArrowDown'])(
    'opens the named diagram type menu with %j and restores focus on Escape',
    async key => {
      render(<WorkspaceCompactHeader documentCount={1} onCreateTemplate={vi.fn()} />);
      const trigger = screen.getByRole('button', { name: 'Choose a diagram type' });

      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-controls', 'workspace-create-diagram-type-menu');

      trigger.focus();
      fireEvent.keyDown(trigger, { key });

      const menu = await screen.findByRole('menu', { name: 'Choose a diagram type' });
      const firstItem = screen.getByRole('menuitem', { name: /Mind map/ });
      expect(menu).toHaveAttribute('id', 'workspace-create-diagram-type-menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(document.activeElement).toBe(firstItem));

      fireEvent.keyDown(menu, { key: 'Escape' });
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    },
  );

  it('creates the selected secondary diagram type and closes the menu', async () => {
    const onCreateTemplate = vi.fn();
    render(<WorkspaceCompactHeader documentCount={1} onCreateTemplate={onCreateTemplate} />);
    const trigger = screen.getByRole('button', { name: 'Choose a diagram type' });

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Timeline/ }));

    expect(onCreateTemplate).toHaveBeenCalledWith('timeline');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  });
});

const renderWorkspaceGlobalHeader = () => render(
  <WorkspaceGlobalHeader
    searchTerm=""
    onSearchTermChange={vi.fn()}
    searchInputRef={{ current: null }}
    searchResultCount={1}
    onClearSearch={vi.fn()}
    onNavigateHome={vi.fn()}
    settingsMenu={[
      { key: 'storage', label: 'Storage and sync' },
      { key: 'account', label: 'Sign in' },
    ]}
    isAuthenticated={false}
  />,
);

describe('WorkspaceGlobalHeader preferences', () => {
  it.each(['Enter', ' ', 'ArrowDown'])(
    'opens the named settings menu with %j and restores focus on Escape',
    async key => {
      renderWorkspaceGlobalHeader();
      const trigger = screen.getByRole('button', { name: 'Settings' });

      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-controls', 'workspace-settings-menu');

      trigger.focus();
      fireEvent.keyDown(trigger, { key });

      const menu = await screen.findByRole('menu', { name: 'Settings' });
      const firstItem = screen.getByRole('menuitem', { name: 'Storage and sync' });
      expect(menu).toHaveAttribute('id', 'workspace-settings-menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(document.activeElement).toBe(firstItem));

      fireEvent.keyDown(menu, { key: 'Escape' });
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    },
  );

  it('exposes the current theme state and switches through the persistent theme manager path', () => {
    const { unmount } = renderWorkspaceGlobalHeader();
    const switchToDark = screen.getByRole('button', { name: 'Toggle theme: Dark' });

    expect(switchToDark).toHaveAttribute('aria-pressed', 'false');
    expect(switchToDark).toHaveAttribute('title', 'Toggle theme: Dark');
    fireEvent.click(switchToDark);
    expect(themeMock.setTheme).toHaveBeenCalledWith('dark');

    unmount();
    themeMock.current = { mode: 'dark' };
    renderWorkspaceGlobalHeader();
    const enabledDarkTheme = screen.getByRole('button', { name: 'Toggle theme: Dark' });
    expect(enabledDarkTheme).toHaveAttribute('aria-pressed', 'true');
    expect(enabledDarkTheme).toHaveAttribute('title', 'Toggle theme: Light');
    expect(screen.queryByRole('button', { name: 'Toggle theme: Light' })).not.toBeInTheDocument();
    fireEvent.click(enabledDarkTheme);
    expect(themeMock.setTheme).toHaveBeenCalledWith('light');
  });
});

describe('workspace menu interaction model', () => {
  it('clamps invalid and edge positions into the visible viewport', () => {
    expect(clampWorkspaceMenuPosition(
      { x: Number.POSITIVE_INFINITY, y: -40 },
      { width: 180, height: 160 },
      { width: 577, height: 720 },
    )).toEqual({ x: 8, y: 8 });
    expect(clampWorkspaceMenuPosition(
      { x: 570, y: 710 },
      { width: 180, height: 160 },
      { width: 577, height: 720 },
    )).toEqual({ x: 389, y: 552 });
  });

  it('wraps keyboard navigation and rejects empty item sets', () => {
    expect(getNextWorkspaceMenuIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(getNextWorkspaceMenuIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(getNextWorkspaceMenuIndex(1, 3, 'Home')).toBe(0);
    expect(getNextWorkspaceMenuIndex(1, 3, 'End')).toBe(2);
    expect(getNextWorkspaceMenuIndex(0, 0, 'ArrowDown')).toBe(-1);
  });

  it('uses a connected fallback when the preferred target disappeared', () => {
    const preferred = document.createElement('button');
    const fallback = document.createElement('main');
    fallback.tabIndex = -1;
    document.body.append(fallback);

    expect(focusWorkspaceTarget(preferred, fallback)).toBe(true);
    expect(document.activeElement).toBe(fallback);
  });

  it('uses the fallback when a connected preferred target cannot receive focus', () => {
    const preferred = document.createElement('button');
    const fallback = document.createElement('main');
    fallback.tabIndex = -1;
    document.body.append(preferred, fallback);
    preferred.focus = vi.fn();

    expect(focusWorkspaceTarget(preferred, fallback)).toBe(true);
    expect(preferred.focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(fallback);
  });
});

const createDeleteOptions = (
  overrides: Partial<WorkspaceDeleteConfirmationOptions> = {},
): WorkspaceDeleteConfirmationOptions => ({
  title: 'Delete diagram?',
  description: 'This cannot be undone.',
  deleteLabel: 'Delete',
  cancelLabel: 'Cancel',
  returnFocusTarget: null,
  fallbackFocusTarget: null,
  deleteItem: vi.fn().mockResolvedValue('deleted'),
  reloadItems: vi.fn().mockResolvedValue(undefined),
  onInvalidId: vi.fn(),
  onSuccess: vi.fn(),
  onFailure: vi.fn(),
  onRefreshFailure: vi.fn(),
  ...overrides,
});

describe('createWorkspaceDeleteConfirmation', () => {
  it('coerces a bounded and unambiguous target name for destructive confirmation', () => {
    expect(coerceWorkspaceDeleteTargetName('  Logistics   Architecture  ', 'Untitled diagram'))
      .toBe('Logistics Architecture');
    expect(coerceWorkspaceDeleteTargetName('Invoice\u0000\n\u202Ecod.exe', 'Untitled diagram'))
      .toBe('Invoice cod.exe');
    expect(coerceWorkspaceDeleteTargetName('', '未命名图表')).toBe('未命名图表');
    expect(coerceWorkspaceDeleteTargetName({ title: 'not trusted' }, 'Untitled diagram'))
      .toBe('Untitled diagram');
    expect(coerceWorkspaceDeleteTargetName('A'.repeat(120), 'Untitled diagram'))
      .toBe(`${'A'.repeat(79)}…`);
  });

  it('allows only one destructive confirmation until the active dialog closes', () => {
    const lock = { active: false };

    expect(beginWorkspaceDeleteDialog(lock)).toBe(true);
    expect(beginWorkspaceDeleteDialog(lock)).toBe(false);
    expect(finishWorkspaceDeleteDialog(lock)).toBe(true);
    expect(finishWorkspaceDeleteDialog(lock)).toBe(false);
    expect(beginWorkspaceDeleteDialog(lock)).toBe(true);
  });

  it('defaults focus to Cancel and returns to the trigger when deletion is cancelled', () => {
    const trigger = document.createElement('button');
    const fallback = document.createElement('main');
    fallback.tabIndex = -1;
    document.body.append(trigger, fallback);
    const config = createWorkspaceDeleteConfirmation(createDeleteOptions({
      returnFocusTarget: trigger,
      fallbackFocusTarget: fallback,
    }));

    expect(config.focusable).toEqual({
      autoFocusButton: 'cancel',
      focusTriggerAfterClose: false,
    });
    config.afterClose?.();
    expect(document.activeElement).toBe(trigger);
  });

  it('focuses the workspace fallback after a successful deletion', async () => {
    const trigger = document.createElement('button');
    const fallback = document.createElement('main');
    fallback.tabIndex = -1;
    document.body.append(trigger, fallback);
    const onSuccess = vi.fn();
    const reloadItems = vi.fn().mockResolvedValue(undefined);
    const config = createWorkspaceDeleteConfirmation(createDeleteOptions({
      returnFocusTarget: trigger,
      fallbackFocusTarget: fallback,
      onSuccess,
      reloadItems,
    }));

    await config.onOk?.();
    trigger.remove();
    config.afterClose?.();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(reloadItems).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(fallback);
  });

  it('keeps the trigger path for invalid IDs and keeps a failed deletion retryable', async () => {
    const trigger = document.createElement('button');
    const fallback = document.createElement('main');
    fallback.tabIndex = -1;
    document.body.append(trigger, fallback);
    const onInvalidId = vi.fn();
    const invalidConfig = createWorkspaceDeleteConfirmation(createDeleteOptions({
      returnFocusTarget: trigger,
      fallbackFocusTarget: fallback,
      deleteItem: vi.fn().mockResolvedValue('invalid-id'),
      onInvalidId,
    }));

    await invalidConfig.onOk?.();
    invalidConfig.afterClose?.();
    expect(onInvalidId).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);

    const failure = new Error('storage unavailable');
    const onFailure = vi.fn();
    const failureConfig = createWorkspaceDeleteConfirmation(createDeleteOptions({
      deleteItem: vi.fn().mockRejectedValue(failure),
      onFailure,
    }));
    await expect(failureConfig.onOk?.()).rejects.toBe(failure);
    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it('distinguishes a completed deletion from a subsequent refresh failure', async () => {
    const trigger = document.createElement('button');
    const fallback = document.createElement('main');
    fallback.tabIndex = -1;
    document.body.append(trigger, fallback);
    const refreshFailure = new Error('refresh unavailable');
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const onRefreshFailure = vi.fn();
    const config = createWorkspaceDeleteConfirmation(createDeleteOptions({
      returnFocusTarget: trigger,
      fallbackFocusTarget: fallback,
      reloadItems: vi.fn().mockRejectedValue(refreshFailure),
      onSuccess,
      onFailure,
      onRefreshFailure,
    }));

    await expect(config.onOk?.()).resolves.toBeUndefined();
    trigger.remove();
    config.afterClose?.();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onRefreshFailure).toHaveBeenCalledWith(refreshFailure);
    expect(document.activeElement).toBe(fallback);
  });
});
