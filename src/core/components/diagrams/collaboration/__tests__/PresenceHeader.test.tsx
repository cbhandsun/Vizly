// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const translations: Record<string, string> = {
  'collaboration.unavailable': '协作服务尚未配置',
  'collaboration.connecting': '正在连接协作服务...',
  'collaboration.connected': '已连接协作服务',
  'collaboration.disconnected': '协作连接已断开',
  'collaboration.activeCount': '1 位在协作',
  'collaboration.openDetails': '打开协作详情：协作服务尚未配置',
  'collaboration.localUser': '你',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

import { PresenceHeader } from '../PresenceHeader';
import { resolveDiagramCollaborationStatus } from '../collaborationStatus';

describe('resolveDiagramCollaborationStatus', () => {
  it('keeps ordinary editor sessions inactive', () => {
    expect(resolveDiagramCollaborationStatus(null, 'wss://collab.example', 'connected')).toBe('inactive');
  });

  it('distinguishes unavailable services from live socket states', () => {
    expect(resolveDiagramCollaborationStatus('room-a', '', 'disconnected')).toBe('unavailable');
    expect(resolveDiagramCollaborationStatus('room-a', 'wss://collab.example', 'connecting')).toBe('connecting');
    expect(resolveDiagramCollaborationStatus('room-a', 'wss://collab.example', 'disconnected')).toBe('disconnected');
  });
});

describe('PresenceHeader collaboration status', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
      observe() { /* no-op */ }
      unobserve() { /* no-op */ }
      disconnect() { /* no-op */ }
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows an unavailable collaboration state even when no users are online', () => {
    const onOpen = vi.fn();
    render(<PresenceHeader activeUsers={[]} status="unavailable" onOpen={onOpen} />);

    expect(screen.getByText('协作服务尚未配置')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '打开协作详情：协作服务尚未配置' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('announces an in-progress connection without requiring presence data', () => {
    render(<PresenceHeader activeUsers={[]} status="connecting" />);

    expect(screen.getByText('正在连接协作服务...')).toBeTruthy();
  });

  it('stays hidden when collaboration is inactive and no users are present', () => {
    const { container } = render(<PresenceHeader activeUsers={null} status="inactive" />);

    expect(container.childElementCount).toBe(0);
  });
});
