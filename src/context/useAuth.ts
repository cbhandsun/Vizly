import { useContext } from 'react';
import { AuthContext } from './AuthContextValue';
import { logAuthProviderFallbackContext } from './authLogging';

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        logAuthProviderFallbackContext();
        const dummyResult = async () => ({ data: { user: null, session: null }, error: null });
        return {
            user: null,
            session: null,
            loading: false,
            signInWithEmail: dummyResult,
            signInWithPassword: dummyResult,
            signUp: dummyResult,
            updatePassword: dummyResult,
            signOut: async () => {},
        } as any;
    }
    return context;
}
