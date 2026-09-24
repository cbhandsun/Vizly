// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
});

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
  window.setTimeout(() => callback(0), 0)
));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('antd/es/app', () => ({
  default: {
    useApp: () => ({ modal: { confirm: vi.fn() } }),
  },
}));

vi.mock('../diagramManagementPage.helpers', async importOriginal => {
  const actual = await importOriginal<typeof import('../diagramManagementPage.helpers')>();
  return {
    ...actual,
    loadWorkspaceItems: vi.fn().mockResolvedValue([]),
    readStoredCloudProvider: () => 'supabase',
  };
});

vi.mock('../WorkspaceCompactHeader', () => ({
  WorkspaceCompactHeader: () => null,
}));

vi.mock('../WorkspaceGlobalHeader', () => ({
  WorkspaceGlobalHeader: () => null,
}));

vi.mock('../WorkspaceContextMenu', () => ({
  WorkspaceContextMenu: () => null,
}));

vi.mock('../WorkspaceDiagramCollection', async () => {
  const ReactModule = await import('react');
  return {
    WorkspaceDiagramCollection: ({
      activeView,
      onActiveViewChange,
    }: {
      activeView: string;
      onActiveViewChange: (view: 'recent' | 'local' | 'cloud') => void;
    }) => (
      <section>
        <output data-testid="active-view">{activeView}</output>
        <button type="button" onClick={() => onActiveViewChange('recent')}>Recent filter</button>
        <button type="button" onClick={() => onActiveViewChange('local')}>Local filter</button>
        <button type="button" onClick={() => onActiveViewChange('cloud')}>Cloud filter</button>
        {ReactModule.createElement('span', { hidden: true }, 'workspace filters')}
      </section>
    ),
  };
});

import DiagramManagementPage from '../DiagramManagementPage';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('DiagramManagementPage filter route continuity', () => {
  it('keeps filters, URL parameters, and browser history synchronized', async () => {
    const router = createMemoryRouter([
      { path: '/manage', element: <DiagramManagementPage /> },
    ], {
      initialEntries: ['/manage?view=local&provider=s3'],
    });

    render(<RouterProvider router={router} />);

    expect((await screen.findByTestId('active-view')).textContent).toBe('local');

    fireEvent.click(screen.getByRole('button', { name: 'Recent filter' }));
    await waitFor(() => expect(router.state.location.search).toBe('?provider=s3'));
    expect(screen.getByTestId('active-view').textContent).toBe('recent');

    fireEvent.click(screen.getByRole('button', { name: 'Cloud filter' }));
    await waitFor(() => expect(router.state.location.search).toBe('?provider=s3&view=cloud'));
    expect(screen.getByTestId('active-view').textContent).toBe('cloud');

    fireEvent.click(screen.getByRole('button', { name: 'Cloud filter' }));
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(router.state.location.search).toBe('?provider=s3'));
    expect(screen.getByTestId('active-view').textContent).toBe('recent');

    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(router.state.location.search).toBe('?view=local&provider=s3'));
    expect(screen.getByTestId('active-view').textContent).toBe('local');
  });
});
