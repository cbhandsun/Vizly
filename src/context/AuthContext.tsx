import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { storageService } from '@/services/SupabaseStorage';

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

import { LayeredConfigManager } from '@/core';

const noSupabaseError = { error: { message: 'Supabase is not configured', name: 'AuthError', status: 0 } as unknown as AuthError };

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        // 1. Initial Session Check
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
            if (session?.user) {
                LayeredConfigManager.getInstance().setCloudAdapter({
                    syncWithCloud: async (onConfigLoaded) => {
                        const cloudConfigs = await storageService.loadAllConfigs();
                        cloudConfigs.forEach(({ key, value }) => onConfigLoaded(key, value));
                    },
                    saveConfig: async (key, data) => {
                        await storageService.saveConfig(key, data, session.user.id);
                    }
                });
            }
        });

        // 2. Subscription to Auth Changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
            if (session?.user) {
                LayeredConfigManager.getInstance().setCloudAdapter({
                    syncWithCloud: async (onConfigLoaded) => {
                        const cloudConfigs = await storageService.loadAllConfigs();
                        cloudConfigs.forEach(({ key, value }) => onConfigLoaded(key, value));
                    },
                    saveConfig: async (key, data) => {
                        await storageService.saveConfig(key, data, session.user.id);
                    }
                });
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signInWithEmail = async (email: string) => {
        if (!supabase) return noSupabaseError;
        return supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
    };

    const signInWithPassword = async (email: string, password: string) => {
        if (!supabase) return noSupabaseError;
        return supabase.auth.signInWithPassword({ email, password });
    };

    const signUp = async (email: string, password: string) => {
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
        if (!supabase) return noSupabaseError;
        return supabase.auth.signOut();
    };

    const updatePassword = async (password: string) => {
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
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
