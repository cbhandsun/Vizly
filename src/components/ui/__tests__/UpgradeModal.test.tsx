// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpgradeModal } from '../UpgradeModal';

const mocks = vi.hoisted(() => ({
  hideUpgradeModal: vi.fn(),
  createCheckoutSession: vi.fn(),
  appMessageError: vi.fn(),
  appMessageWarning: vi.fn(),
  subscription: { jwtToken: 'jwt-token' as string | undefined },
}));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
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

vi.mock('@/context/useSubscription', () => ({
  useSubscription: () => ({
    isUpgradeModalVisible: true,
    hideUpgradeModal: mocks.hideUpgradeModal,
    upgradeFeatureContext: 'PDF export',
    jwtToken: mocks.subscription.jwtToken,
  }),
}));

vi.mock('@/services/checkoutSessionClient', () => ({
  createCheckoutSession: (...args: unknown[]) => mocks.createCheckoutSession(...args),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
  appMessage: {
    error: mocks.appMessageError,
    warning: mocks.appMessageWarning,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'upgrade.featureContext'
      ? 'Upgrade to Pro to unlock'
      : key,
  }),
}));

vi.mock('@/components/auth/AuthModal', () => ({
  AuthModal: ({
    onAuthenticated,
    onCancel,
  }: {
    onAuthenticated?: () => void;
    onCancel: () => void;
  }) => (
    <div role="dialog" aria-label="mock-auth-modal">
      <button type="button" onClick={onAuthenticated}>authenticate</button>
      <button type="button" onClick={onCancel}>cancel-auth</button>
    </div>
  ),
}));

describe('UpgradeModal', () => {
  beforeEach(() => {
    mocks.subscription.jwtToken = 'jwt-token';
    mocks.hideUpgradeModal.mockReset();
    mocks.createCheckoutSession.mockReset();
    mocks.appMessageError.mockReset();
    mocks.appMessageWarning.mockReset();
  });

  it('portals outside the scaled app root and exposes a named dialog', () => {
    const layout = document.createElement('div');
    layout.id = 'app-root-layout';
    document.body.appendChild(layout);

    render(<UpgradeModal />);

    const dialog = screen.getByRole('dialog', { name: 'upgrade.title' });
    const modalRoot = dialog.closest('.ant-modal-root');
    expect(document.body.contains(modalRoot)).toBe(true);
    expect(layout.querySelector('.ant-modal-root')).toBeNull();
    expect(modalRoot?.className).toContain('upgrade-viewport-modal');
    layout.remove();
  });

  it('separates the localized upgrade prefix from the feature name', () => {
    render(<UpgradeModal />);

    const context = document.querySelector('.upgrade-modal__feature-context');
    expect(context?.textContent).toBe('Upgrade to Pro to unlock PDF export');
  });

  it('keeps login recovery explicit and distinguishes successful authentication', async () => {
    mocks.subscription.jwtToken = 'guest';
    render(<UpgradeModal />);

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.subscribe' }));
    expect(await screen.findByRole('dialog', { name: 'mock-auth-modal' })).toBeTruthy();
    expect(screen.getByText('upgrade.authRequiredTitle')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'authenticate' }));
    await waitFor(() => expect(screen.getByText('upgrade.authCompleteTitle')).toBeTruthy());
    expect(screen.queryByRole('dialog', { name: 'mock-auth-modal' })).toBeNull();
  });

  it('keeps checkout failure visible, redacted, and retryable', async () => {
    mocks.createCheckoutSession.mockRejectedValue(
      new Error('Authorization: Bearer checkout-secret'),
    );
    render(<UpgradeModal />);

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.subscribe' }));

    expect(await screen.findByText('upgrade.checkoutFailedTitle')).toBeTruthy();
    expect(screen.queryByText(/checkout-secret/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'upgrade.retryCheckout' })[0]);
    await waitFor(() => expect(mocks.createCheckoutSession).toHaveBeenCalledTimes(2));
  });

  it('aborts an in-flight checkout before closing the upgrade dialog', async () => {
    let receivedSignal: AbortSignal | undefined;
    mocks.createCheckoutSession.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      receivedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    render(<UpgradeModal />);

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.subscribe' }));
    await waitFor(() => expect(receivedSignal).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.later' }));

    expect(receivedSignal?.aborted).toBe(true);
    expect(mocks.hideUpgradeModal).toHaveBeenCalledOnce();
    expect(mocks.appMessageError).not.toHaveBeenCalled();
  });

  it('keeps close and action controls touch-safe and reflows them on narrow screens', () => {
    const css = readFileSync('src/components/ui/UpgradeModal.css', 'utf8');

    expect(css).toMatch(/\.upgrade-viewport-modal \.ant-modal-close,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.upgrade-modal__actions[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  });
});
