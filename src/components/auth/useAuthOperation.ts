import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const AUTH_EMAIL_MAX_LENGTH = 254;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export type AuthErrorMessageKey =
    | 'auth.modal.invalidCredentials'
    | 'auth.modal.emailInvalid'
    | 'auth.modal.errors.accountExists'
    | 'auth.modal.errors.passwordRejected'
    | 'auth.modal.errors.rateLimited'
    | 'auth.modal.errors.unavailable';

interface AuthOperationResult {
    error: unknown | null;
}

interface AuthOperationCallbacks {
    onSuccess: () => void;
    onError: (messageKey: AuthErrorMessageKey) => void;
}

const readStringField = (value: unknown, field: string): string => {
    if (!value || typeof value !== 'object') return '';
    const candidate = (value as Record<string, unknown>)[field];
    return typeof candidate === 'string' ? candidate.trim().toLowerCase().slice(0, 256) : '';
};

const readStatus = (value: unknown): number | null => {
    if (!value || typeof value !== 'object') return null;
    const status = (value as Record<string, unknown>).status;
    return typeof status === 'number' && Number.isFinite(status) ? status : null;
};

export const resolveAuthErrorMessageKey = (error: unknown): AuthErrorMessageKey => {
    const code = readStringField(error, 'code');
    const message = readStringField(error, 'message');
    const status = readStatus(error);

    if (status === 429 || code.includes('rate_limit') || message.includes('rate limit')) {
        return 'auth.modal.errors.rateLimited';
    }
    if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
        return 'auth.modal.invalidCredentials';
    }
    if (code === 'user_already_exists' || message.includes('already registered')) {
        return 'auth.modal.errors.accountExists';
    }
    if (code === 'weak_password' || message.includes('password should be')) {
        return 'auth.modal.errors.passwordRejected';
    }
    if (code === 'email_address_invalid' || message.includes('invalid email')) {
        return 'auth.modal.emailInvalid';
    }
    return 'auth.modal.errors.unavailable';
};

export const useAuthOperation = (active = true) => {
    const revisionRef = useRef(0);
    const busyRef = useRef(false);
    const activeRef = useRef(active);
    const [busy, setBusy] = useState(false);
    const [errorMessageKey, setErrorMessageKey] = useState<AuthErrorMessageKey | null>(null);

    useLayoutEffect(() => {
        activeRef.current = active;
    }, [active]);

    useEffect(() => () => {
        revisionRef.current += 1;
        busyRef.current = false;
    }, []);

    const invalidate = useCallback(() => {
        revisionRef.current += 1;
        busyRef.current = false;
        setBusy(false);
        setErrorMessageKey(null);
    }, []);

    const clearError = useCallback(() => {
        if (!busyRef.current) setErrorMessageKey(null);
    }, []);

    const run = useCallback(async (
        operation: () => Promise<AuthOperationResult>,
        callbacks: AuthOperationCallbacks,
    ): Promise<boolean> => {
        if (!activeRef.current || busyRef.current) return false;

        busyRef.current = true;
        const revision = revisionRef.current + 1;
        revisionRef.current = revision;
        setBusy(true);
        setErrorMessageKey(null);

        try {
            const result = await operation();
            if (revisionRef.current !== revision || !activeRef.current) return true;

            if (result.error) {
                const messageKey = resolveAuthErrorMessageKey(result.error);
                setErrorMessageKey(messageKey);
                callbacks.onError(messageKey);
            } else {
                callbacks.onSuccess();
            }
        } catch {
            if (revisionRef.current !== revision || !activeRef.current) return true;
            const messageKey: AuthErrorMessageKey = 'auth.modal.errors.unavailable';
            setErrorMessageKey(messageKey);
            callbacks.onError(messageKey);
        } finally {
            if (revisionRef.current === revision) {
                busyRef.current = false;
                if (activeRef.current) setBusy(false);
            }
        }

        return true;
    }, []);

    return {
        busy,
        errorMessageKey,
        clearError,
        invalidate,
        run,
    };
};
