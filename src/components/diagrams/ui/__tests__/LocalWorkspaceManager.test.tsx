// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  confirm: vi.fn(),
  deleteCustomPreset: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  presets: {} as Record<string, { id: string }>,
  success: vi.fn(),
}));

vi.mock('@/core/utils/customPresetStorage', () => ({
  CUSTOM_PRESETS_LIMIT: 100,
  deleteCustomPreset: state.deleteCustomPreset,
  readCustomPresetMap: () => state.presets,
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
  appMessage: {
    error: state.error,
    success: state.success,
  },
  appModal: {
    confirm: state.confirm,
    info: state.info,
  },
}));

const t = ((key: string, options?: Record<string, unknown>) => {
  if (options?.name) return `${key}:${String(options.name)}`;
  if (options?.count !== undefined) return `${key}:${String(options.count)}/${String(options.max)}`;
  return key;
}) as unknown as TFunction;

import {
  LocalWorkspaceManagerContent,
} from '../LocalWorkspaceManager';
import { openLocalWorkspaceManager } from '../openLocalWorkspaceManager';

describe('LocalWorkspaceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.presets = {
      Alpha: { id: 'alpha' },
      Beta: { id: 'beta' },
    };
    state.deleteCustomPreset.mockImplementation((name: string) => {
      const next = { ...state.presets };
      delete next[name];
      state.presets = next;
      return { ok: true, remainingCount: Object.keys(next).length };
    });
  });

  it('shows capacity, searchable template names, and accessible delete actions', () => {
    render(<LocalWorkspaceManagerContent t={t} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'diagramViewer.switcher.localManager.usage:2/100',
    );
    expect(screen.getByRole('button', {
      name: 'diagramViewer.switcher.localManager.deleteNamed:Alpha',
    })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', {
      name: 'diagramViewer.switcher.localManager.search',
    }), { target: { value: 'beta' } });

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('requires destructive confirmation and refreshes the list after a successful delete', async () => {
    render(<LocalWorkspaceManagerContent t={t} />);

    fireEvent.click(screen.getByRole('button', {
      name: 'diagramViewer.switcher.localManager.deleteNamed:Alpha',
    }));
    const confirmation = state.confirm.mock.calls[0]?.[0] as { onOk: () => Promise<void> };

    await act(async () => confirmation.onOk());

    expect(state.deleteCustomPreset).toHaveBeenCalledWith('Alpha');
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(state.success).toHaveBeenCalledWith(
      'diagramViewer.switcher.localManager.deleted:Alpha',
    );
  });

  it('keeps data visible and reports a rejected storage write', async () => {
    state.deleteCustomPreset.mockReturnValue({ ok: false, error: 'writeFailed' });
    render(<LocalWorkspaceManagerContent t={t} />);

    fireEvent.click(screen.getByRole('button', {
      name: 'diagramViewer.switcher.localManager.deleteNamed:Alpha',
    }));
    const confirmation = state.confirm.mock.calls[0]?.[0] as { onOk: () => Promise<void> };

    await expect(confirmation.onOk()).rejects.toThrow('writeFailed');

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(state.error).toHaveBeenCalledWith(
      'diagramViewer.switcher.localManager.writeError',
    );
  });

  it('opens a focused local-library modal without a destructive default action', () => {
    openLocalWorkspaceManager(t);

    expect(state.info).toHaveBeenCalledWith(expect.objectContaining({
      title: 'diagramViewer.switcher.localManager.title',
      okText: 'common.close',
      maskClosable: false,
      width: 640,
    }));
  });
});
