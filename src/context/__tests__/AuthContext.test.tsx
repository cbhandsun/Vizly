// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../AuthContext';
import { useAuth } from '../useAuth';

const supabaseModuleMock = vi.fn();

vi.mock('@/services/supabase', () => {
  supabaseModuleMock();
  return { supabase: null };
});

const Probe = () => {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <button
        type="button"
        onClick={() => {
          void auth.signInWithEmail('user@example.test').then(({
            error,
          }: { error: { message: string; code?: string } | null }) => {
            document.body.dataset.authError = error?.message || '';
            document.body.dataset.authErrorCode = error?.code || '';
          });
        }}
      >
        sign in
      </button>
    </div>
  );
};

describe('AuthProvider', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete document.body.dataset.authError;
    delete document.body.dataset.authErrorCode;
    localStorage.clear();
    window.location.hash = '';
  });

  it.each([
    ['', ''],
    ['https://project.supabase.co', ''],
    ['', 'anon-key'],
    ['javascript:alert(1)', 'anon-key'],
  ])('reports missing or invalid auth configuration without loading the client', async (url, key) => {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
    window.location.hash = '#access_token=token';

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(supabaseModuleMock).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'sign in' }).click();
    await waitFor(() => expect(document.body.dataset.authError).toBe('Supabase is not configured'));
    expect(document.body.dataset.authErrorCode).toBe('auth_not_configured');
  });

  it('ignores encoded auth-looking strings that are not Supabase hash parameters', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    window.location.hash = '#next=access_token%3Dtest-canary';

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(supabaseModuleMock).not.toHaveBeenCalled();
  });

  it('loads Supabase when a recovery session hash is present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    window.location.hash = '#type=recovery';

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(supabaseModuleMock).toHaveBeenCalled();
  });
});
