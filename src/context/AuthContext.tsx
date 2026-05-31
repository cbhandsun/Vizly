import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signInWithEmail: (email: string) => Promise<{ error: AuthError | null }>;
    signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const noSupabaseError = { error: { message: 'Supabase is not configured', name: 'AuthError', status: 0 } as unknown as AuthError };

let supabaseModulePromise: Promise<typeof import('@/services/supabase')> | null = null;

const loadSupabaseClient = async () => {
    supabaseModulePromise ??= import('@/services/supabase');
    const { supabase } = await supabaseModulePromise;
    return supabase;
};

const configureCloudAdapter = async (session: Session | null) => {
    if (!session?.user) return;

    const [{ LayeredConfigManager }, { storageService }] = await Promise.all([
        import('@/core/config/LayeredConfigManager'),
        import('@/services/SupabaseStorage')
    ]);

    LayeredConfigManager.getInstance().setCloudAdapter({
        syncWithCloud: async (onConfigLoaded: (key: string, value: any) => void) => {
            const cloudConfigs = await storageService.loadAllConfigs();
            cloudConfigs.forEach(({ key, value }: { key: string; value: any }) => onConfigLoaded(key, value));
        },
        saveConfig: async (key: string, data: any) => {
            await storageService.saveConfig(key, data, session.user.id);
        }
    });
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | undefined;

        const applySession = (session: Session | null) => {
            if (cancelled) return;
            setSession(session);
            setUser(session?.user ?? null);
            if (typeof window !== 'undefined') {
                (window as any).__currentUserId = session?.user?.id || null;
            }
            setLoading(false);
            if (session?.user) {
                void configureCloudAdapter(session).catch((error) => {
                    console.error('Failed to configure cloud adapter:', error);
                });
            }
        };

        const initializeAuth = async () => {
            const supabase = await loadSupabaseClient();
            if (cancelled) return;

            if (!supabase) {
                setLoading(false);
                return;
            }

            // 1. Initial Session Check
            const { data: { session } } = await supabase.auth.getSession();
            applySession(session);

            // 2. Subscription to Auth Changes
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                applySession(session);
            });
            unsubscribe = () => subscription.unsubscribe();
        };

        void initializeAuth().catch((error) => {
            console.error('Auth initialization failed:', error);
            if (!cancelled) setLoading(false);
        });

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, []);

    const signInWithEmail = async (email: string) => {
        const supabase = await loadSupabaseClient();
        if (!supabase) return noSupabaseError;
        return supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
    };

    const signInWithPassword = async (email: string, password: string) => {
        const supabase = await loadSupabaseClient();
        if (!supabase) return noSupabaseError;
        return supabase.auth.signInWithPassword({ email, password });
    };

    const signUp = async (email: string, password: string) => {
        const supabase = await loadSupabaseClient();
        if (!supabase) return noSupabaseError;
        return supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
    };

    const signOut = async () => {
        const supabase = await loadSupabaseClient();
        if (!supabase) return noSupabaseError;
        return supabase.auth.signOut();
    };

    const updatePassword = async (password: string) => {
        const supabase = await loadSupabaseClient();
        if (!supabase) return noSupabaseError;
        return supabase.auth.updateUser({ password });
    };

    return (
        <AuthContext.Provider value={{
            user, session, loading,
            signInWithEmail, signInWithPassword, signUp, updatePassword, signOut,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

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

