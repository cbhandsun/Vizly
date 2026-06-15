import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionProvider } from '../SubscriptionContext';
import { useSubscription } from '../useSubscription';

const useAuthMock = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const Probe = () => {
  const subscription = useSubscription();
  return (
    <div>
      <span data-testid="tier">{subscription.tier}</span>
      <span data-testid="pdf">{String(subscription.hasFeature('export-pdf'))}</span>
      <span data-testid="set-tier">{String('setTier' in subscription)}</span>
      <span data-testid="jwt">{subscription.jwtToken || ''}</span>
    </div>
  );
};

const renderWithTier = (tier: unknown, accessToken = 'jwt-token') => {
  useAuthMock.mockReturnValue({
    user: {
      id: 'user-1',
      app_metadata: { tier },
    },
    session: { access_token: accessToken },
  });

  render(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>
  );
};

describe('SubscriptionProvider', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('enables pro features only for server-provided pro tiers', () => {
    renderWithTier('pro');

    expect(screen.getByTestId('tier')).toHaveTextContent('pro');
    expect(screen.getByTestId('pdf')).toHaveTextContent('true');
    expect(screen.getByTestId('jwt')).toHaveTextContent('jwt-token');
  });

  it('falls back to free for missing or invalid tier metadata', () => {
    renderWithTier('__proto__');

    expect(screen.getByTestId('tier')).toHaveTextContent('free');
    expect(screen.getByTestId('pdf')).toHaveTextContent('false');
  });

  it('does not expose a client-side tier mutation escape hatch', () => {
    renderWithTier('free');

    expect(screen.getByTestId('set-tier')).toHaveTextContent('false');
  });
});
