import { describe, expect, it } from 'vitest';

import {
    buildSupabaseFunctionUrl,
    normalizeStripePriceId,
    normalizeSupabaseUrl,
} from '../runtimeEnv';

describe('runtimeEnv', () => {
    describe('normalizeSupabaseUrl', () => {
        it('normalizes valid Supabase origins', () => {
            expect(normalizeSupabaseUrl(' https://example.supabase.co/path/ignored ')).toBe(
                'https://example.supabase.co'
            );
            expect(normalizeSupabaseUrl('http://localhost:54321')).toBe('http://localhost:54321');
            expect(normalizeSupabaseUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
        });

        it('rejects malformed or unsafe origins', () => {
            expect(normalizeSupabaseUrl(undefined)).toBeNull();
            expect(normalizeSupabaseUrl('')).toBeNull();
            expect(normalizeSupabaseUrl('javascript:alert(1)')).toBeNull();
            expect(normalizeSupabaseUrl('http://supabase.example.test')).toBeNull();
            expect(normalizeSupabaseUrl('https://user:pass@example.supabase.co')).toBeNull();
            expect(normalizeSupabaseUrl('https://example.supabase.co?token=leak')).toBeNull();
            expect(normalizeSupabaseUrl('https://example.supabase.co#fragment')).toBeNull();
            expect(normalizeSupabaseUrl(`https://example.supabase.co/${'a'.repeat(2_048)}`)).toBeNull();
        });
    });

    describe('buildSupabaseFunctionUrl', () => {
        it('builds a Supabase function URL from a valid origin and function name', () => {
            expect(buildSupabaseFunctionUrl('https://example.supabase.co/', 'create-checkout-session')).toBe(
                'https://example.supabase.co/functions/v1/create-checkout-session'
            );
        });

        it('rejects invalid function names and origins', () => {
            expect(buildSupabaseFunctionUrl('https://example.supabase.co', '../admin')).toBeNull();
            expect(buildSupabaseFunctionUrl('https://example.supabase.co', 'x'.repeat(81))).toBeNull();
            expect(buildSupabaseFunctionUrl('ftp://example.supabase.co', 'create-checkout-session')).toBeNull();
        });
    });

    describe('normalizeStripePriceId', () => {
        it('normalizes Stripe price ids', () => {
            expect(normalizeStripePriceId(' price_123ABC_xyz ')).toBe('price_123ABC_xyz');
        });

        it('rejects missing, mock, or malformed price ids', () => {
            expect(normalizeStripePriceId(undefined)).toBeNull();
            expect(normalizeStripePriceId('')).toBeNull();
            expect(normalizeStripePriceId('price_mock_123')).toBeNull();
            expect(normalizeStripePriceId('prod_123')).toBeNull();
            expect(normalizeStripePriceId('price_../secret')).toBeNull();
            expect(normalizeStripePriceId(`price_${'a'.repeat(129)}`)).toBeNull();
        });
    });
});
