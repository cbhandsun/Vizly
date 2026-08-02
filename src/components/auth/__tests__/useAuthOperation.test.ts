import { describe, expect, it } from 'vitest';

import {
    AUTH_EMAIL_MAX_LENGTH,
    AUTH_PASSWORD_MAX_LENGTH,
    resolveAuthErrorMessageKey,
} from '../useAuthOperation';

describe('authentication input and error boundaries', () => {
    it.each([
        [{ code: 'invalid_credentials' }, 'auth.modal.invalidCredentials'],
        [{ message: 'Invalid login credentials' }, 'auth.modal.invalidCredentials'],
        [{ code: 'user_already_exists' }, 'auth.modal.errors.accountExists'],
        [{ code: 'weak_password' }, 'auth.modal.errors.passwordRejected'],
        [{ code: 'email_address_invalid' }, 'auth.modal.emailInvalid'],
        [{ status: 429 }, 'auth.modal.errors.rateLimited'],
    ])('maps supported provider failures without exposing provider text', (error, expected) => {
        expect(resolveAuthErrorMessageKey(error)).toBe(expected);
    });

    it.each([
        null,
        undefined,
        '',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        [],
        { message: '<img src=x onerror=alert(1)> Bearer secret-token' },
        { code: 'unknown', status: Number.MAX_SAFE_INTEGER },
    ])('returns a safe generic key for malformed or unknown failures', (error) => {
        expect(resolveAuthErrorMessageKey(error)).toBe('auth.modal.errors.unavailable');
    });

    it('defines finite commercial input limits', () => {
        expect(AUTH_EMAIL_MAX_LENGTH).toBe(254);
        expect(AUTH_PASSWORD_MAX_LENGTH).toBe(128);
    });
});
