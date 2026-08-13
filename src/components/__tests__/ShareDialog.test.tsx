// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const authMocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
}));

const languageMocks = vi.hoisted(() => ({
  current: 'zh',
}));

const serviceMocks = vi.hoisted(() => ({
  addCollaborator: vi.fn(),
  buildShareUrl: vi.fn(),
  createShareLink: vi.fn(),
  listCollaborators: vi.fn(),
  listSharesForDiagram: vi.fn(),
  removeCollaborator: vi.fn(),
  revokeShare: vi.fn(),
}));

const messageMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

const clipboardMocks = vi.hoisted(() => ({
  copy: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  loadFailure: vi.fn(),
  mutationFailure: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: authMocks.user }),
}));

vi.mock('@/services/ShareService', () => ({
  shareService: serviceMocks,
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
  appMessage: messageMocks,
}));

vi.mock('@/components/shareClipboard', () => ({
  tryCopyShareUrl: clipboardMocks.copy,
}));

vi.mock('@/components/shareDialogLogging', () => ({
  logShareDialogLoadFailure: loggingMocks.loadFailure,
  logShareDialogMutationFailure: loggingMocks.mutationFailure,
}));

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
        if (!open) onAfterClose?.();
      }, [onAfterClose, open]);

      if (!open) return null;
      return (
        <div role="dialog" aria-label="认证">
          <button type="button" aria-label="关闭" onClick={onCancel}>关闭</button>
          <span>auth.modal.loginButton</span>
        </div>
      );
    },
  };
});

const translations: Record<string, string> = {
  'share.title': '分享图表',
  'share.closeDialog': '关闭分享图表',
  'share.footerNote': '分享的图表可随时撤销访问权限',
  'share.tabs.invite': '定向邀请',
  'share.tabs.link': '公开链接',
  'share.inviteInput': '输入用户的注册邮箱...',
  'share.roleViewer': '只读 (Viewer)',
  'share.roleEditor': '编辑 (Editor)',
  'share.inviteBtn': '邀请',
  'share.inviteHint': '邀请已注册用户，并选择只读或编辑权限。',
  'share.emailRequired': '请输入协作者邮箱。',
  'share.emailInvalid': '请输入有效的邮箱地址。',
  'share.emailTooLong': '邮箱地址过长，请检查后重试。',
  'share.roleLabel': '协作者权限',
  'share.roleEditorComingSoon': '编辑（即将支持）',
  'share.collaborators': '协作者',
  'share.collaboratorsEmpty': '输入邮箱邀请协作者查看此图表',
  'share.loginRequired': '请先登录后才能使用分享功能',
  'share.loginRequiredHint': '登录后将返回当前分享流程，不会丢失图表。',
  'share.loginAction': '立即登录',
  'share.modeLabel': '分享方式',
  'share.never': '永不过期',
  'share.1day': '1 天',
  'share.7days': '7 天',
  'share.30days': '30 天',
  'share.generateLink': '生成分享链接',
  'share.copied': '链接已复制到剪贴板',
  'share.copyUnavailable': '链接已生成，请手动复制',
  'share.copyFailed': '复制失败，请手动选择链接',
  'share.collaboratorsLoadFailed': '无法加载协作者',
  'share.linksLoadFailed': '无法加载分享链接',
  'share.linkHistory': '分享链接历史',
  'share.linkEmpty': '生成公开链接，任何拥有链接的人都可查看',
  'share.loadRetryHint': '连接恢复后可直接重试，不会影响当前图表。',
  'share.generateFailed': '无法生成分享链接',
  'share.generateRetryHint': '请确认图表已保存到云端并稍后重试。',
  'share.inviteFailedSafe': '邀请未发送',
  'share.inviteRetryHint': '请确认对方已注册，或稍后重试。',
  'share.remove': '移除',
  'share.removeConfirm': '确认移除此协作者？',
  'share.removeFailed': '无法移除协作者，请稍后重试。',
  'share.revokeFailed': '无法撤销分享链接，请稍后重试。',
  'share.expired': '已过期',
  'common.close': '关闭',
  'common.cancel': '取消',
  'common.retry': '重试',
};

const englishTranslations: Record<string, string> = {
  'share.title': 'Share Diagram',
  'share.closeDialog': 'Close Share Diagram',
  'share.footerNote': 'Access to shared diagrams can be revoked at any time',
  'share.tabs.invite': 'Invite People',
  'share.tabs.link': 'Public Link',
  'share.inviteInput': 'Add registered email...',
  'share.roleViewer': 'Viewer',
  'share.inviteBtn': 'Invite',
  'share.inviteHint': 'Invite a registered user and choose view-only or edit access.',
  'share.collaborators': 'Collaborators',
  'share.collaboratorsEmpty': 'Invite collaborators by email to view this diagram',
  'share.loginRequired': 'Please sign in to use sharing',
  'share.loginRequiredHint': 'After signing in, you will return to this sharing flow without losing the diagram.',
  'share.loginAction': 'Sign in now',
  'share.modeLabel': 'Sharing method',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      const dictionary = languageMocks.current === 'en' ? englishTranslations : translations;
      return typeof fallback === 'string' ? fallback : dictionary[key] || key;
    },
    i18n: {
      language: languageMocks.current,
      resolvedLanguage: languageMocks.current,
    },
  }),
}));

import ShareDialog from '../diagrams/ShareDialog';
import { createShareDialogOperationGate } from '@/components/shareDialogOperationGate';
import {
  getShareExpiresAt,
  isCloudDiagramId,
  resolveShareDiagramId,
} from '@/components/shareDialogPresentation';

const DIAGRAM_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SHARE_URL = 'https://vizly.example/#/shared?token=abcdefghijklmnop';
const shareRecord = {
  id: '33333333-3333-4333-8333-333333333333',
  diagram_id: DIAGRAM_ID,
  share_token: 'abcdefghijklmnop',
  created_by: USER_ID,
  expires_at: null,
  is_active: true,
  created_at: '2026-08-01T00:00:00.000Z',
};

const createCollaborator = (diagramId: string, userId: string, email: string) => ({
  diagram_id: diagramId,
  user_id: userId,
  role: 'viewer' as const,
  added_by: USER_ID,
  created_at: '2026-08-01T00:00:00.000Z',
  email,
});

const savedDiagram = (diagramId = DIAGRAM_ID) => ({ status: 'saved', diagramId } as const);

describe('ShareDialog commercial failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    languageMocks.current = 'zh';
    authMocks.user = null;
    serviceMocks.listSharesForDiagram.mockResolvedValue([]);
    serviceMocks.listCollaborators.mockResolvedValue([]);
    serviceMocks.createShareLink.mockResolvedValue(shareRecord);
    serviceMocks.buildShareUrl.mockReturnValue(SHARE_URL);
    clipboardMocks.copy.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('explains the login prerequisite on the default invite tab', async () => {
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    expect(await screen.findByText('请先登录后才能使用分享功能')).toBeTruthy();
    expect((screen.getByRole('button', { name: '邀请' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: '输入用户的注册邮箱...' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '立即登录' })).toBeTruthy();
  });

  it('focuses the login action whenever an unauthenticated sharing dialog opens', async () => {
    const onClose = vi.fn();
    const onEnsureSaved = vi.fn();
    const { rerender } = render(
      <ShareDialog open onClose={onClose} diagramId={DIAGRAM_ID} onEnsureSaved={onEnsureSaved} />,
    );

    const loginAction = await screen.findByRole('button', { name: '立即登录' });
    await waitFor(() => expect(document.activeElement).toBe(loginAction));

    rerender(
      <ShareDialog open={false} onClose={onClose} diagramId={DIAGRAM_ID} onEnsureSaved={onEnsureSaved} />,
    );
    rerender(
      <ShareDialog open onClose={onClose} diagramId={DIAGRAM_ID} onEnsureSaved={onEnsureSaved} />,
    );

    await waitFor(() => expect(document.activeElement).toBe(loginAction));
  });

  it('stacks the unauthenticated explanation and login action on narrow viewports', async () => {
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    const alertTitle = await screen.findByText('请先登录后才能使用分享功能');
    expect(alertTitle.closest('.ant-alert')?.classList.contains('share-dialog-login-alert')).toBe(true);

    const css = readFileSync('src/components/diagrams/ShareDialog.css', 'utf8');
    expect(css).toContain('.share-dialog-login-alert.ant-alert-with-description');
    expect(css).toContain('grid-template-columns: max-content minmax(0, 1fr)');
    expect(css).toContain('.share-dialog-login-alert .ant-alert-section');
    expect(css).toMatch(/\.share-dialog-login-alert \.ant-alert-actions\s*\{[^}]*grid-column:\s*2;[^}]*width:\s*100%;/s);
  });

  it('does not request protected share data or expose retry errors before sign-in', async () => {
    serviceMocks.listSharesForDiagram.mockRejectedValue(new Error('authentication required'));
    serviceMocks.listCollaborators.mockRejectedValue(new Error('authentication required'));

    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    expect(await screen.findByText('请先登录后才能使用分享功能')).toBeTruthy();
    await waitFor(() => {
      expect(serviceMocks.listSharesForDiagram).not.toHaveBeenCalled();
      expect(serviceMocks.listCollaborators).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(loggingMocks.loadFailure).not.toHaveBeenCalled();
  });

  it('explains the login prerequisite before disabled public-link controls', async () => {
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    fireEvent.click(await screen.findByText('公开链接'));

    const activePanel = await screen.findByRole('tabpanel');
    const loginMessage = within(activePanel).getByText('请先登录后才能使用分享功能');
    const generateButton = within(activePanel).getByRole('button', { name: '生成分享链接' });
    expect(loginMessage.compareDocumentPosition(generateButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((generateButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps focus on the selected tab after switching sharing modes', async () => {
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    const publicLinkLabel = await screen.findByText('公开链接');
    const publicLinkTab = publicLinkLabel.closest('[role="tab"]') as HTMLElement | null;
    expect(publicLinkTab).toBeTruthy();
    if (!publicLinkTab) return;
    publicLinkTab.focus();
    fireEvent.click(publicLinkTab);

    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-controls')).toContain('panel-link');
    });
  });

  it('labels the tab list and automatically activates keyboard navigation targets', async () => {
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    const tabList = await screen.findByRole('tablist', { name: '分享方式' });
    const inviteTab = within(tabList).getByRole('tab', { name: '定向邀请' });
    const publicLinkTab = within(tabList).getByRole('tab', { name: '公开链接' });
    inviteTab.focus();

    fireEvent.keyDown(inviteTab, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(publicLinkTab.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(publicLinkTab);
    });

    fireEvent.keyDown(publicLinkTab, { key: 'Home' });
    await waitFor(() => {
      expect(inviteTab.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(inviteTab);
    });
  });

  it('renders the unauthenticated sharing flow without mixed-language copy', async () => {
    languageMocks.current = 'en';
    const { container } = render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    expect(await screen.findByText('Invite collaborators by email to view this diagram')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Share Diagram' })).toBeTruthy();
    expect(screen.getByText('Access to shared diagrams can be revoked at any time')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u);
  });

  it('opens authentication directly and preserves the sharing dialog underneath', async () => {
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '立即登录' }));

    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2));
    expect(screen.getByText('auth.modal.loginButton')).toBeTruthy();
    expect(screen.getByText('分享图表')).toBeTruthy();
  });

  it('restores focus to the login action after nested authentication closes', async () => {
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    const loginAction = await screen.findByRole('button', { name: '立即登录' });
    fireEvent.click(loginAction);

    const authContent = await screen.findByText('auth.modal.loginButton');
    const authDialog = authContent.closest('[role="dialog"]');
    expect(authDialog).toBeTruthy();
    fireEvent.click(within(authDialog as HTMLElement).getByRole('button', { name: '关闭' }));

    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(loginAction));
  });

  it('blocks an invalid email locally and explains how to recover', async () => {
    authMocks.user = { id: USER_ID };
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    const email = await screen.findByPlaceholderText('输入用户的注册邮箱...');
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.blur(email);

    expect(await screen.findByText('请输入有效的邮箱地址。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '邀请' }) as HTMLButtonElement).disabled).toBe(true);
    expect(serviceMocks.addCollaborator).not.toHaveBeenCalled();
  });

  it('allows an owner to invite a collaborator with editor permission', async () => {
    authMocks.user = { id: USER_ID };
    serviceMocks.addCollaborator.mockResolvedValue({ success: true, user_id: USER_ID });
    const ensureSaved = vi.fn(async () => savedDiagram());
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={ensureSaved} />,
    );

    const email = await screen.findByPlaceholderText('输入用户的注册邮箱...');
    fireEvent.change(email, { target: { value: 'editor@example.com' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '协作者权限' }));
    fireEvent.click(await screen.findByText('编辑 (Editor)'));
    fireEvent.click(screen.getByRole('button', { name: '邀请' }));

    await waitFor(() => {
      expect(serviceMocks.addCollaborator).toHaveBeenCalledWith(
        DIAGRAM_ID,
        'editor@example.com',
        'editor',
      );
    });
  });

  it('reloads collaborators with the saved cloud id after inviting from a local diagram', async () => {
    authMocks.user = { id: USER_ID };
    serviceMocks.addCollaborator.mockResolvedValue({ success: true, user_id: USER_ID });
    render(
      <ShareDialog
        open
        onClose={vi.fn()}
        diagramId="local-unsaved-diagram"
        onEnsureSaved={vi.fn(async () => savedDiagram())}
      />,
    );

    fireEvent.change(await screen.findByPlaceholderText('输入用户的注册邮箱...'), {
      target: { value: 'viewer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '邀请' }));

    await waitFor(() => {
      expect(serviceMocks.addCollaborator).toHaveBeenCalledWith(
        DIAGRAM_ID,
        'viewer@example.com',
        'viewer',
      );
      expect(serviceMocks.listCollaborators).toHaveBeenCalledWith(DIAGRAM_ID);
    });
  });

  it('shows a retry action instead of treating collaborator load failure as an empty list', async () => {
    authMocks.user = { id: USER_ID };
    serviceMocks.listCollaborators.mockRejectedValueOnce(new Error('network unavailable'));
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    expect(await screen.findByText('无法加载协作者')).toBeTruthy();
    serviceMocks.listCollaborators.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(serviceMocks.listCollaborators).toHaveBeenCalledTimes(2));
    expect(loggingMocks.loadFailure).toHaveBeenCalledWith('collaborators', expect.any(Error));
  });

  it('clears protected collaboration data when the active account signs out', async () => {
    authMocks.user = { id: USER_ID };
    serviceMocks.listCollaborators.mockResolvedValue([
      createCollaborator(DIAGRAM_ID, '44444444-4444-4444-8444-444444444444', 'private@example.com'),
    ]);
    const { rerender } = render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    expect(await screen.findByText('private@example.com')).toBeTruthy();
    authMocks.user = null;
    rerender(<ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />);

    expect(await screen.findByText('请先登录后才能使用分享功能')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('private@example.com')).toBeNull());
  });

  it('ignores stale collaborator responses after switching diagrams', async () => {
    authMocks.user = { id: USER_ID };
    const nextDiagramId = '55555555-5555-4555-8555-555555555555';
    let resolveFirst: ((records: ReturnType<typeof createCollaborator>[]) => void) | undefined;
    let resolveSecond: ((records: ReturnType<typeof createCollaborator>[]) => void) | undefined;
    serviceMocks.listCollaborators
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { rerender } = render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={vi.fn()} />,
    );

    await waitFor(() => expect(serviceMocks.listCollaborators).toHaveBeenCalledWith(DIAGRAM_ID));
    rerender(<ShareDialog open onClose={vi.fn()} diagramId={nextDiagramId} onEnsureSaved={vi.fn()} />);
    await waitFor(() => expect(serviceMocks.listCollaborators).toHaveBeenCalledWith(nextDiagramId));

    resolveSecond?.([
      createCollaborator(nextDiagramId, '66666666-6666-4666-8666-666666666666', 'current@example.com'),
    ]);
    expect(await screen.findByText('current@example.com')).toBeTruthy();

    resolveFirst?.([
      createCollaborator(DIAGRAM_ID, '77777777-7777-4777-8777-777777777777', 'stale@example.com'),
    ]);
    await waitFor(() => expect(screen.queryByText('stale@example.com')).toBeNull());
    expect(screen.getByText('current@example.com')).toBeTruthy();
  });

  it('keeps a created link visible when clipboard permission is denied', async () => {
    authMocks.user = { id: USER_ID };
    clipboardMocks.copy.mockResolvedValue(false);
    const ensureSaved = vi.fn(async () => savedDiagram());
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={ensureSaved} />,
    );

    fireEvent.click(await screen.findByText('公开链接'));
    fireEvent.click(await screen.findByRole('button', { name: '生成分享链接' }));

    expect(await screen.findByText('链接已生成，请手动复制')).toBeTruthy();
    expect(screen.getAllByText(SHARE_URL).length).toBeGreaterThan(0);
    expect(serviceMocks.createShareLink).toHaveBeenCalledWith(expect.objectContaining({ diagramId: DIAGRAM_ID }));
    expect(messageMocks.warning).toHaveBeenCalledWith('链接已生成，请手动复制');
    expect(messageMocks.error).not.toHaveBeenCalled();
  });

  it('does not let a cloud-id reload overwrite a newly created link', async () => {
    authMocks.user = { id: USER_ID };
    let resolveReload: ((records: typeof shareRecord[]) => void) | undefined;
    serviceMocks.listSharesForDiagram.mockImplementation(() => new Promise((resolve) => {
      resolveReload = resolve;
    }));
    render(
      <ShareDialog
        open
        onClose={vi.fn()}
        diagramId="local-unsaved-diagram"
        onEnsureSaved={vi.fn(async () => savedDiagram())}
      />,
    );

    fireEvent.click(await screen.findByText('公开链接'));
    fireEvent.click(await screen.findByRole('button', { name: '生成分享链接' }));

    await waitFor(() => {
      expect(serviceMocks.listSharesForDiagram).toHaveBeenCalledWith(DIAGRAM_ID);
      expect(clipboardMocks.copy).toHaveBeenCalledWith(SHARE_URL);
    });
    resolveReload?.([]);

    await waitFor(() => {
      expect(document.querySelectorAll('.ant-list-item')).toHaveLength(1);
      expect(screen.queryByText('生成公开链接，任何拥有链接的人都可查看')).toBeNull();
    });
  });

  it('shows a stable error and never renders a raw provider failure', async () => {
    authMocks.user = { id: USER_ID };
    const providerFailure = new Error('Authorization: Bearer share-provider-secret');
    serviceMocks.createShareLink.mockRejectedValue(providerFailure);
    render(
      <ShareDialog
        open
        onClose={vi.fn()}
        diagramId={DIAGRAM_ID}
        onEnsureSaved={vi.fn(async () => savedDiagram())}
      />,
    );

    fireEvent.click(await screen.findByText('公开链接'));
    fireEvent.click(await screen.findByRole('button', { name: '生成分享链接' }));

    await waitFor(() => {
      expect(messageMocks.error).toHaveBeenCalledWith('无法生成分享链接，请稍后重试');
    });
    expect(loggingMocks.mutationFailure).toHaveBeenCalledWith('createShareLink', providerFailure);
    expect(document.body.textContent).not.toContain('share-provider-secret');
  });

  it('treats a cancelled prerequisite save as a neutral user decision', async () => {
    authMocks.user = { id: USER_ID };
    render(
      <ShareDialog
        open
        onClose={vi.fn()}
        diagramId={DIAGRAM_ID}
        onEnsureSaved={vi.fn(async () => ({ status: 'cancelled' } as const))}
      />,
    );

    fireEvent.click(await screen.findByText('公开链接'));
    fireEvent.click(await screen.findByRole('button', { name: '生成分享链接' }));

    await waitFor(() => {
      expect((screen.getByRole('button', { name: '生成分享链接' }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(serviceMocks.createShareLink).not.toHaveBeenCalled();
    expect(screen.queryByText('无法生成分享链接')).toBeNull();
    expect(messageMocks.error).not.toHaveBeenCalled();
  });

  it('coalesces rapid link creation attempts before the prerequisite save resolves', async () => {
    authMocks.user = { id: USER_ID };
    let resolveSave: ((result: ReturnType<typeof savedDiagram>) => void) | undefined;
    const ensureSaved = vi.fn(() => new Promise<ReturnType<typeof savedDiagram>>((resolve) => {
      resolveSave = resolve;
    }));
    render(
      <ShareDialog open onClose={vi.fn()} diagramId={DIAGRAM_ID} onEnsureSaved={ensureSaved} />,
    );

    fireEvent.click(await screen.findByText('公开链接'));
    const generate = await screen.findByRole('button', { name: '生成分享链接' });
    fireEvent.click(generate);
    fireEvent.click(generate);

    expect(ensureSaved).toHaveBeenCalledTimes(1);
    resolveSave?.(savedDiagram());
    await waitFor(() => expect(serviceMocks.createShareLink).toHaveBeenCalledTimes(1));
  });

  it('does not continue creating a link after the dialog is closed during save', async () => {
    authMocks.user = { id: USER_ID };
    let resolveSave: ((result: ReturnType<typeof savedDiagram>) => void) | undefined;
    const ensureSaved = vi.fn(() => new Promise<ReturnType<typeof savedDiagram>>((resolve) => {
      resolveSave = resolve;
    }));
    const onClose = vi.fn();
    render(
      <ShareDialog open onClose={onClose} diagramId={DIAGRAM_ID} onEnsureSaved={ensureSaved} />,
    );

    fireEvent.click(await screen.findByText('公开链接'));
    fireEvent.click(await screen.findByRole('button', { name: '生成分享链接' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭分享图表' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    resolveSave?.(savedDiagram());
    await waitFor(() => expect(ensureSaved).toHaveBeenCalledTimes(1));
    expect(serviceMocks.createShareLink).not.toHaveBeenCalled();
    expect(clipboardMocks.copy).not.toHaveBeenCalled();
  });

  it('serializes mutations and invalidates stale continuations at the dialog boundary', () => {
    const gate = createShareDialogOperationGate();
    const first = gate.begin('create-link');

    expect(first).not.toBeNull();
    expect(gate.begin('invite')).toBeNull();
    gate.invalidate();
    expect(first && gate.isCurrent(first)).toBe(false);
    expect(first && gate.finish(first)).toBe(false);
    expect(gate.begin('invite')).not.toBeNull();
  });

  it('keeps share expiration and cloud identity boundaries deterministic', () => {
    const now = new Date('2026-08-12T10:00:00.000Z');
    const scope = { sourceDiagramId: 'local-a', cloudDiagramId: 'cloud-a' };

    expect(getShareExpiresAt('1day', now)?.toISOString()).toBe('2026-08-13T10:00:00.000Z');
    expect(getShareExpiresAt('never', now)).toBeNull();
    expect(now.toISOString()).toBe('2026-08-12T10:00:00.000Z');
    expect(isCloudDiagramId(DIAGRAM_ID)).toBe(true);
    expect(isCloudDiagramId('../11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(isCloudDiagramId('x'.repeat(10_000))).toBe(false);
    expect(resolveShareDiagramId('local-a', scope)).toBe('cloud-a');
    expect(resolveShareDiagramId('local-b', scope)).toBe('local-b');
    expect(resolveShareDiagramId('local-a', null)).toBe('local-a');
  });
});
