// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { NotificationInstance } from 'antd/es/notification/interface';
import { createRef, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useFlowchartImportNotifications } from '../useFlowchartImportNotifications';

const makeNotificationApi = () => ({
  destroy: vi.fn(),
  open: vi.fn(),
}) satisfies Pick<NotificationInstance, 'destroy' | 'open'>;

describe('useFlowchartImportNotifications', () => {
  it('shows a persistent progress notice and clears it after success', () => {
    const notificationApi = makeNotificationApi();
    const fileInputRef = createRef<HTMLInputElement>();
    const { result } = renderHook(() => useFlowchartImportNotifications({
      notificationApi,
      fileInputRef,
      t: (key) => key,
    }));

    act(() => result.current.handleImportStarted());
    expect(notificationApi.open).toHaveBeenCalledWith(expect.objectContaining({
      key: 'flowchart-file-import-status',
      type: 'info',
      duration: 0,
    }));

    act(() => result.current.handleImportFinished({ status: 'success' }));
    expect(notificationApi.destroy).toHaveBeenCalledWith('flowchart-file-import-status');
  });

  it('distinguishes a scope cancellation from a content failure', () => {
    const notificationApi = makeNotificationApi();
    const fileInputRef = createRef<HTMLInputElement>();
    const { result } = renderHook(() => useFlowchartImportNotifications({
      notificationApi,
      fileInputRef,
      t: (key) => key,
    }));

    act(() => result.current.handleImportFinished({ status: 'scope-changed' }));
    expect(notificationApi.open).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'warning',
      duration: 8,
      message: 'designer.flowchart.import.cancelledTitle',
      description: 'designer.flowchart.import.scopeChanged',
      btn: undefined,
    }));

    act(() => result.current.handleImportFinished({
      status: 'failure',
      detail: 'The selected file is empty.',
    }));
    expect(notificationApi.open).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'error',
      duration: 0,
      message: 'designer.flowchart.import.failedTitle',
      description: 'The selected file is empty.',
    }));
    expect(notificationApi.open.mock.calls.at(-1)?.[0].btn).toBeTruthy();
  });

  it('keeps a generic fallback and exposes a retry action', () => {
    const notificationApi = makeNotificationApi();
    const fileInputRef = createRef<HTMLInputElement>();
    const fileInput = document.createElement('input');
    document.body.appendChild(fileInput);
    fileInputRef.current = fileInput;
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    const { result } = renderHook(() => useFlowchartImportNotifications({
      notificationApi,
      fileInputRef,
      t: (key) => key,
    }));

    act(() => result.current.handleImportFinished({ status: 'failure' }));

    const config = notificationApi.open.mock.calls.at(-1)?.[0];
    expect(config).toEqual(expect.objectContaining({
      description: 'designer.flowchart.import.failedDescription',
    }));
    const retry = config?.btn as ReactElement<{ onClick: () => void }>;
    act(() => retry.props.onClick());
    expect(notificationApi.destroy).toHaveBeenCalledWith('flowchart-file-import-status');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
