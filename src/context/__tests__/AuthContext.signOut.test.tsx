// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../useAuth';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  clear: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/supabase', () => ({ supabase: { auth: {
  signOut: mocks.signOut,
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} } }));
vi.mock('../authSensitiveRuntime', () => ({ clearAuthSensitiveRuntimeState: mocks.clear }));

function Probe() {
  const auth = useAuth();
  return <button onClick={() => { void auth.signOut().then(({ error }) => {
    document.body.dataset.signOutResult = error ? 'failed' : 'success';
  }); }}>Sign out</button>;
}

describe('AuthProvider session sign out boundary', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-public-key');
    localStorage.clear();
    window.location.hash = '';
    mocks.signOut.mockReset();
    mocks.clear.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete document.body.dataset.signOutResult;
  });
  it.each([null, { message: 'test failure', name: 'AuthError', status: 500 }])(
    'restricts logout to this session even when the request fails: %j', async error => {
      mocks.signOut.mockResolvedValue({ error });
      render(<AuthProvider><Probe /></AuthProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' }));
      await waitFor(() => expect(document.body.dataset.signOutResult).toBe(error ? 'failed' : 'success'));
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    },
  );
});
