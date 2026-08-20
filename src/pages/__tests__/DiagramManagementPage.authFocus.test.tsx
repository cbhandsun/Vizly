// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
});

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
  window.setTimeout(() => callback(0), 0)
));

const headerMocks = vi.hoisted(() => ({
  hideMenu: null as (() => void) | null,
}));

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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

vi.mock('../WorkspaceDiagramCollection', () => ({
  WorkspaceDiagramCollection: () => null,
}));

vi.mock('../WorkspaceContextMenu', () => ({
  WorkspaceContextMenu: () => null,
}));

vi.mock('../WorkspaceGlobalHeader', async () => {
  const ReactModule = await import('react');
  return {
    WorkspaceGlobalHeader: ({
      settingsMenu,
      settingsTriggerRef,
      onSettingsMenuClick,
    }: {
      settingsMenu?: Array<unknown>;
      settingsTriggerRef?: React.Ref<HTMLButtonElement>;
      onSettingsMenuClick?: (event: { key: string }) => void;
    }) => {
      const [menuVisible, setMenuVisible] = ReactModule.useState(true);
      ReactModule.useEffect(() => {
        headerMocks.hideMenu = () => setMenuVisible(false);
        return () => { headerMocks.hideMenu = null; };
      }, []);
      const accountItem = settingsMenu?.find((item): item is { key: string } => (
        typeof item === 'object'
        && item !== null
        && 'key' in item
        && item.key === 'account'
      ));

      return (
        <header>
          <button ref={settingsTriggerRef} type="button">settings trigger</button>
          {menuVisible ? (
            <button
              type="button"
              onClick={() => {
                if (accountItem) onSettingsMenuClick?.({ key: accountItem.key });
              }}
            >
              open sign in
            </button>
          ) : null}
        </header>
      );
    },
  };
});

vi.mock('@/components/auth/AuthModal', async () => {
  const ReactModule = await import('react');
  return {
    AuthModal: ({
      open,
      onCancel,
      onAfterClose,
    }: {
      open: boolean;
      onCancel: () => void;
      onAfterClose?: () => void;
    }) => {
      ReactModule.useEffect(() => {
        if (!open) {
          onAfterClose?.();
          headerMocks.hideMenu?.();
        }
      }, [onAfterClose, open]);

      return open ? (
        <div role="dialog" aria-label="authentication">
          <button type="button" onClick={onCancel}>close authentication</button>
        </div>
      ) : null;
    },
  };
});

import DiagramManagementPage from '../DiagramManagementPage';

afterEach(() => {
  cleanup();
});

describe('DiagramManagementPage authentication focus lifecycle', () => {
  it('returns focus to the settings trigger after the menu login target is removed', async () => {
    render(<DiagramManagementPage />);

    const settingsTrigger = screen.getByRole('button', { name: 'settings trigger' });
    const signInAction = screen.getByRole('button', { name: 'open sign in' });
    signInAction.focus();
    fireEvent.click(signInAction);

    expect(screen.getByRole('button', { name: 'open sign in' })).toBe(signInAction);
    fireEvent.click(await screen.findByRole('button', { name: 'close authentication' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'open sign in' })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'authentication' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(settingsTrigger));
  });
});
