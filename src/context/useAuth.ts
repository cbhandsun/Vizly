import { useContext } from 'react';
import { AuthContext } from './AuthContextValue';

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        console.warn('[HMR Warning] useAuth was called outside of an AuthProvider. Returning temporary fallback context.');
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
