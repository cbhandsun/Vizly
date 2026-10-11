import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ confirm: vi.fn<(options: { onOk?: () => void | Promise<void>; afterClose?: () => void }) => { update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>(), update: vi.fn(), destroy: vi.fn() }));
vi.mock('@vizly/core/antd', () => ({ appModal: { confirm: fixture.confirm } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { CollaborationRecoveryBanner } from '../CollaborationRecoveryBanner';
import { CollaborationRecoveryError } from '../../collaboration/collaborationRecoveryClient';
describe('collaboration recovery actions', () => {
  beforeEach(() => { fixture.confirm.mockReset(); fixture.update.mockReset(); fixture.destroy.mockReset(); fixture.confirm.mockReturnValue({ update: fixture.update, destroy: fixture.destroy }); });
  it('requires confirmation, blocks duplicate dialogs and delegates durable restore only after approval', async () => {
    const restore = vi.fn(async () => undefined);
    render(<CollaborationRecoveryBanner problem="cloud-conflict" onSaveCopy={async () => undefined} onRetry={vi.fn()} onRestore={restore} />);
    const button = screen.getByRole('button', { name: 'collaboration.recovery.restore' });
    fireEvent.click(button); fireEvent.click(button);
    expect(fixture.confirm).toHaveBeenCalledOnce(); expect(restore).not.toHaveBeenCalled();
    await act(async () => { await fixture.confirm.mock.calls[0][0].onOk?.(); });
    expect(restore).toHaveBeenCalledOnce();
  });
  it('shows safe copy failure in the confirmation and permits retry without reconnecting', async () => {
    const retry = vi.fn();
    render(<CollaborationRecoveryBanner problem="cloud-conflict" onSaveCopy={async () => undefined} onRetry={retry} onRestore={async () => { throw new CollaborationRecoveryError('copyFailed'); }} />);
    fireEvent.click(screen.getByRole('button', { name: 'collaboration.recovery.restore' }));
    await act(async () => { await expect(fixture.confirm.mock.calls[0][0].onOk?.()).rejects.toMatchObject({ code: 'copyFailed' }); });
    expect(screen.getByText('collaboration.recovery.restoreErrors.copyFailed')).toBeTruthy();
    expect(fixture.update).toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
  });
  it('closes its restore confirmation if the banner unmounts', () => {
    const view = render(<CollaborationRecoveryBanner problem="cloud-conflict" onSaveCopy={async () => undefined} onRetry={vi.fn()} onRestore={async () => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'collaboration.recovery.restore' })); view.unmount();
    expect(fixture.destroy).toHaveBeenCalledOnce();
  });
  it('keeps current edits until a deliberate local copy action is requested', async () => {
    const save = vi.fn(async () => undefined);
    const retry = vi.fn();
    render(<CollaborationRecoveryBanner problem="cloud-conflict" onSaveCopy={save} onRetry={retry} />);
    expect(screen.getByText('collaboration.recovery.conflictTitle')).toBeTruthy();
    expect(save).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'collaboration.recovery.saveCopy' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(retry).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation before reconnecting and replacing the canvas', () => {
    const retry = vi.fn();
    render(<CollaborationRecoveryBanner problem="cloud-unavailable" onSaveCopy={async () => undefined} onRetry={retry} />);
    expect(screen.getByText('collaboration.recovery.unavailableTitle')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'collaboration.recovery.retry' }));
    expect(retry).not.toHaveBeenCalled();
    expect(fixture.confirm).toHaveBeenCalledWith(expect.objectContaining({ content: 'collaboration.recovery.retryDescription' }));
    act(() => fixture.confirm.mock.calls[0][0].onOk?.());
    expect(retry).toHaveBeenCalledOnce();
  });
  it('blocks reconnect while copy preparation is pending and reports failure without error details', async () => {
    let reject: (error: Error) => void = () => { throw new Error('Not initialized'); };
    const pending = new Promise<void>((_resolve, deny) => { reject = deny; });
    render(<CollaborationRecoveryBanner problem="cloud-conflict" onSaveCopy={() => pending} onRetry={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'collaboration.recovery.saveCopy' }));
    expect(screen.getByRole('button', { name: 'collaboration.recovery.retry' }).hasAttribute('disabled')).toBe(true);
    await act(async () => { reject(new Error('Private synthetic provider details')); });
    expect(screen.getByText('collaboration.recovery.copyFailed')).toBeTruthy();
    expect(screen.queryByText('Private synthetic provider details')).toBeNull();
    expect(screen.getByRole('button', { name: 'collaboration.recovery.retry' }).hasAttribute('disabled')).toBe(false);
  });
});
