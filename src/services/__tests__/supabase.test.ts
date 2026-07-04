import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn());
const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
    safeLog: safeLogState,
}));

const importFreshSupabaseModule = async () => {
    vi.resetModules();
    return import('../supabase');
};

describe('supabase bootstrap', () => {
    beforeEach(() => {
        createClientMock.mockReset();
        Object.values(safeLogState).forEach(mock => mock.mockReset());
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('logs a safe warning and exports null when required env is missing', async () => {
        const module = await importFreshSupabaseModule();

        expect(module.supabase).toBeNull();
        expect(createClientMock).not.toHaveBeenCalled();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            'Supabase URL or Anon Key is missing or invalid. Cloud features will be disabled.'
        );
    });
});
