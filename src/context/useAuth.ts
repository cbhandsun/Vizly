import { useContext } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { AuthContext } from './AuthContextValue';
import type { AuthContextType } from './AuthContextValue';
import { logAuthProviderFallbackContext } from './authLogging';

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        logAuthProviderFallbackContext();
        const dummyResult = async (): Promise<{ error: AuthError | null }> => ({ error: null });
        const fallbackContext: AuthContextType = {
            user: null,
            session: null,
            loading: false,
            signInWithEmail: dummyResult,
            signInWithPassword: dummyResult,
            signUp: dummyResult,
            updatePassword: dummyResult,
            signOut: dummyResult,
        };
        return fallbackContext;
    }
    return context;
}
