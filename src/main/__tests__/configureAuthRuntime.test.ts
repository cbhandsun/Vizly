import { describe, expect, it, vi } from 'vitest';
import { clearAuthSensitiveRuntimeState } from '@/context/authSensitiveRuntime';
import { updateAuthSessionOwner } from '@/context/authSessionBoundary';
import { getAIConfig, persistAIConfig } from '@/components/ai/aiConfigStorage';
const crypto = vi.hoisted(() => {
    let finish!: () => void;
    const ready = new Promise<void>(resolve => { finish = resolve; });
    return { ready, finish, clearKeyCache: vi.fn(), clearUserSecret: vi.fn() };
});
vi.mock('@vizly/core/security', async () => {
    await crypto.ready;
    return { CryptoService: { clearKeyCache: crypto.clearKeyCache, clearUserSecret: crypto.clearUserSecret } };
});
import '../configureAuthRuntime';
describe('deferred auth cleanup', () => {
    it('cannot clear a newly entered key after A to B to A while the cleanup module is loading', async () => {
        updateAuthSessionOwner('a', 'first');
        const cleanup = clearAuthSensitiveRuntimeState('a', { removeLocalSecret: true });
        updateAuthSessionOwner('b'); updateAuthSessionOwner('a', 'second');
        persistAIConfig('a', { activeModelKey: 'provider:model', systemPrompt: '', providers: [{
            id: 'provider', name: 'Provider', enabled: true, baseUrl: 'https://example.com/v1', apiKey: 'new-session-canary',
            models: [{ id: 'model', name: 'Model', enabled: true }],
        }] });
        crypto.finish(); await cleanup;
        expect(getAIConfig('a').providers[0].apiKey).toBe('new-session-canary');
        expect(crypto.clearUserSecret).not.toHaveBeenCalled();
        await clearAuthSensitiveRuntimeState('a');
        expect(getAIConfig('a').providers[0].apiKey).toBe('');
        expect(crypto.clearKeyCache).toHaveBeenCalledOnce();
    });
});
