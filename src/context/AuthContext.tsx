import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from '@/services/runtimeEnv';
import { getWindowHashString } from '@/core/utils/inputBoundary';
import { AuthContext } from './AuthContextValue';
import {
    logAuthInitializationFailure,
    logAuthRuntimeStateClearFailure,
    logCloudAdapterConfigurationFailure,
} from './authLogging';
import { clearAuthSensitiveRuntimeState } from './authSensitiveRuntime';

declare global {
    interface Window {
        __currentUserId?: string | null;
    }
}

const noSupabaseError = { error: { message: 'Supabase is not configured', name: 'AuthError', status: 0 } as unknown as AuthError };

let supabaseModulePromise: Promise<typeof import('@/services/supabase')> | null = null;

const hasSupabaseEnv = () => {
    return Boolean(normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL) && import.meta.env.VITE_SUPABASE_ANON_KEY);
};

const getSupabaseAuthStorageKey = () => {
    try {
        const normalizedUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
        if (!normalizedUrl) return null;
        const hostname = new URL(normalizedUrl).hostname;
        const projectRef = hostname.split('.')[0];
        return projectRef ? `sb-${projectRef}-auth-token` : null;
    } catch {
        return null;
    }
};

const hasSupabaseAuthSessionHint = () => {
    if (!hasSupabaseEnv() || typeof window === 'undefined') return false;

    const hash = getWindowHashString();
    if (hash.includes('access_token=') || hash.includes('refresh_token=') || hash.includes('type=recovery')) {
        return true;
    }

    try {
        const storageKey = getSupabaseAuthStorageKey();
        if (storageKey && window.localStorage.getItem(storageKey)) return true;
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key?.startsWith('sb-') && key.endsWith('-auth-token')) return true;
        }
    } catch {
        return true;
    }

    return false;
};

const loadSupabaseClient = async () => {
    if (!hasSupabaseEnv()) return null;
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
        syncWithCloud: async (onConfigLoaded) => {
            const cloudConfigs = await storageService.loadAllConfigs();
            cloudConfigs.forEach(({ key, value }) => {
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    onConfigLoaded(key, value as Record<string, unknown>);
                }
            });
        },
        saveConfig: async (key, data) => {
            await storageService.saveConfig(key, data, session.user.id);
        }
    });
};

const clearSensitiveRuntimeState = async (
    userId: string,
    options: { removeLocalSecret?: boolean } = {}
) => {
    if (!userId) return;

    try {
        await clearAuthSensitiveRuntimeState(userId, options);
    } catch (error) {
        logAuthRuntimeStateClearFailure(error);
    }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const lastUserIdRef = useRef<string | null>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    const applySession = useCallback((session: Session | null) => {
        const nextUserId = session?.user?.id ?? null;
        const previousUserId = lastUserIdRef.current;
        if (previousUserId && previousUserId !== nextUserId) {
            void clearSensitiveRuntimeState(previousUserId);
        }
        lastUserIdRef.current = nextUserId;

        setSession(session);
        setUser(session?.user ?? null);
        if (typeof window !== 'undefined') {
            window.__currentUserId = nextUserId;
        }
        setLoading(false);
        if (session?.user) {
            void configureCloudAdapter(session).catch((error) => {
                logCloudAdapterConfigurationFailure(error);
            });
        }
    }, []);

    const ensureAuthSubscription = useCallback(async () => {
        const supabase = await loadSupabaseClient();
        if (!supabase) return null;

        if (!unsubscribeRef.current) {
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                applySession(session);
            });
            unsubscribeRef.current = () => subscription.unsubscribe();
        }

        return supabase;
    }, [applySession]);

    useEffect(() => {
        let cancelled = false;

        const initializeAuth = async () => {
            if (!hasSupabaseAuthSessionHint()) {
                setLoading(false);
                return;
            }

            const supabase = await ensureAuthSubscription();
            if (cancelled) return;

            if (!supabase) {
                setLoading(false);
                return;
            }

            // 1. Initial Session Check
            const { data: { session } } = await supabase.auth.getSession();
            if (!cancelled) applySession(session);
        };

        void initializeAuth().catch((error) => {
            logAuthInitializationFailure(error);
            if (!cancelled) setLoading(false);
        });

        return () => {
            cancelled = true;
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
        };
    }, [applySession, ensureAuthSubscription]);

    const signInWithEmail = async (email: string) => {
        const supabase = await ensureAuthSubscription();
        if (!supabase) return noSupabaseError;
        return supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
    };

    const signInWithPassword = async (email: string, password: string) => {
        const supabase = await ensureAuthSubscription();
        if (!supabase) return noSupabaseError;
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (!result.error) applySession(result.data.session);
        return result;
    };

    const signUp = async (email: string, password: string) => {
        const supabase = await ensureAuthSubscription();
        if (!supabase) return noSupabaseError;
        const result = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
        if (!result.error) applySession(result.data.session);
        return result;
    };

    const signOut = async () => {
        const supabase = await ensureAuthSubscription();
        if (!supabase) return noSupabaseError;
        const previousUserId = user?.id ?? lastUserIdRef.current;
        const result = await supabase.auth.signOut();
        if (!result.error && previousUserId) {
            void clearSensitiveRuntimeState(previousUserId, { removeLocalSecret: true });
            applySession(null);
        }
        return result;
    };

    const updatePassword = async (password: string) => {
        const supabase = await ensureAuthSubscription();
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

