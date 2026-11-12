import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateAuthSessionOwner, captureAuthSession, getAuthSessionBoundaryId } from '@/context/authSessionBoundary';
import { coerceCloudConfigValue } from '@/services/cloudConfigSecurity';
import { AI_CLOUD_CONFIG_KEY, clearRuntimeAIConfig, getAIConfig, getAIConfigKey, loadCloudAIConfig, persistAIConfig, saveCloudAIConfig, setRuntimeAIConfig, type AIConfigState } from '../aiConfigStorage';
const storage = vi.hoisted(() => ({ loadConfig: vi.fn(), saveConfig: vi.fn() }));
vi.mock('@/services/SupabaseStorage', () => ({ storageService: storage }));
const config = (apiKey = '', baseUrl = 'https://example.com/v1'): AIConfigState => ({
    activeModelKey: 'provider:model', systemPrompt: 'preference',
    providers: [{ id: 'provider', name: 'Provider', enabled: true, baseUrl, apiKey, models: [{ id: 'model', name: 'Model', enabled: true }] }],
});
const secret = 'synthetic-session-key-canary';
beforeEach(() => {
    updateAuthSessionOwner('a'); clearRuntimeAIConfig(); localStorage.clear(); vi.resetAllMocks();
});
describe('session-only credentials', () => {
    it('keeps user and anonymous keys out of persistence and requires re-entry after memory is cleared', () => {
        for (const owner of ['a', null]) {
            updateAuthSessionOwner(owner); persistAIConfig(owner, config(secret));
            expect(getAIConfig(owner).providers[0].apiKey).toBe(secret);
            expect(localStorage.getItem(getAIConfigKey(owner))).not.toContain(secret);
            clearRuntimeAIConfig();
            expect(getAIConfig(owner).providers[0]).toMatchObject({ apiKey: '', credentialState: 'required' });
        }
    });
    it('invalidates A synchronously, including an A to B to A transition and anonymous transitions', () => {
        persistAIConfig('a', config(secret)); const token = captureAuthSession('a');
        updateAuthSessionOwner('b');
        expect(token.signal.aborted).toBe(true); expect(token.isCurrent()).toBe(false);
        expect(getAIConfig('b').providers.every(p => !p.apiKey)).toBe(true);
        updateAuthSessionOwner('a'); expect(getAIConfig('a').providers[0].apiKey).toBe('');
        expect(token.isCurrent()).toBe(false);
        updateAuthSessionOwner(null); persistAIConfig(null, config(secret));
        updateAuthSessionOwner('a'); updateAuthSessionOwner(null);
        expect(getAIConfig(null).providers[0].apiKey).toBe('');
    });
    it('preserves a refreshed session but invalidates another login for the same account', () => {
        const token = (id: string) => `header.${btoa(JSON.stringify({ session_id: id }))}.signature`;
        updateAuthSessionOwner('a', getAuthSessionBoundaryId(token('session-1')));
        persistAIConfig('a', config(secret)); const work = captureAuthSession('a');
        updateAuthSessionOwner('a', getAuthSessionBoundaryId(token('session-1')));
        expect(work.isCurrent()).toBe(true); expect(getAIConfig('a').providers[0].apiKey).toBe(secret);
        updateAuthSessionOwner('a', getAuthSessionBoundaryId(token('session-2')));
        expect(work.isCurrent()).toBe(false); expect(getAIConfig('a').providers[0].apiKey).toBe('');
        expect(getAuthSessionBoundaryId('malformed')).toBeUndefined();
    });
    it('does not clear B when a delayed cleanup for A finishes', () => {
        updateAuthSessionOwner('b'); persistAIConfig('b', config(secret)); clearRuntimeAIConfig('a');
        expect(getAIConfig('b').providers[0].apiKey).toBe(secret);
    });
    it('leaves legacy encrypted records byte-for-byte intact and never treats ciphertext as a usable key', async () => {
        const old = JSON.stringify(config('ENC2:unrecoverable-fixture'));
        const key = 'DiagramView.AIConfig_V2_Advanced_a'; localStorage.setItem(key, old);
        expect(getAIConfig('a').providers[0]).toMatchObject({ apiKey: '', credentialState: 'legacy-unavailable' });
        storage.loadConfig.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.parse(old));
        const loaded = await loadCloudAIConfig('a');
        expect(loaded?.providers[0]).toMatchObject({ apiKey: '', credentialState: 'legacy-unavailable' });
        persistAIConfig('a', config(secret)); await saveCloudAIConfig('a', config(secret));
        expect(localStorage.getItem(key)).toBe(old);
        expect(storage.saveConfig).toHaveBeenCalledWith(AI_CLOUD_CONFIG_KEY, expect.objectContaining({ version: 3 }), 'a');
        expect(JSON.stringify(storage.saveConfig.mock.calls)).not.toContain(secret);
        expect(storage.saveConfig.mock.calls.some(call => call[0] === 'ai_config')).toBe(false);
    });
    it('strips secrets and unknown fields at the cloud storage boundary too', () => {
        const input = config(secret); const provider = input.providers[0];
        const result = coerceCloudConfigValue(AI_CLOUD_CONFIG_KEY, { ...input, token: secret,
            providers: [{ ...provider, secret, baseUrl: 'https://example.com/v1?token=hidden' }] });
        expect(JSON.stringify(result)).not.toContain(secret); expect(JSON.stringify(result)).not.toContain('hidden');
        expect(result).toMatchObject({ version: 3, providers: [{ apiKey: '', credentialState: 'required' }] });
    });
    it('rejects a cloud response from the previous account without any runtime side effect', async () => {
        let resolve!: (value: AIConfigState) => void;
        storage.loadConfig.mockImplementation(() => new Promise<AIConfigState>(done => { resolve = done; }));
        const pending = loadCloudAIConfig('a'); await vi.waitFor(() => expect(storage.loadConfig).toHaveBeenCalled());
        updateAuthSessionOwner('b'); resolve(config(secret));
        expect(await pending).toBeNull();
        updateAuthSessionOwner('a'); expect(getAIConfig('a').providers.every(p => !p.apiKey)).toBe(true);
    });
    it('does not overwrite a newer local save with a delayed cloud response', async () => {
        let resolve!: (value: AIConfigState) => void;
        storage.loadConfig.mockImplementation(() => new Promise<AIConfigState>(done => { resolve = done; }));
        const pending = loadCloudAIConfig('a'); await vi.waitFor(() => expect(storage.loadConfig).toHaveBeenCalled());
        persistAIConfig('a', config(secret)); resolve(config('ENC2:old'));
        expect(await pending).toBeNull(); expect(getAIConfig('a').providers[0].apiKey).toBe(secret);
    });
    it('preserves an in-session key only for the same provider and endpoint', async () => {
        persistAIConfig('a', config(secret)); storage.loadConfig.mockResolvedValue(config('server-plaintext'));
        const loaded = await loadCloudAIConfig('a'); expect(loaded?.providers[0].apiKey).toBe(secret);
        storage.loadConfig.mockResolvedValue(config('', 'https://other.example/v1'));
        expect((await loadCloudAIConfig('a'))?.providers[0].apiKey).toBe('');
    });
    it('restores non-sensitive settings on another device but never a cloud credential', async () => {
        storage.loadConfig.mockResolvedValue({ ...config(secret), version: 3 });
        const loaded = await loadCloudAIConfig('a'); expect(loaded?.systemPrompt).toBe('preference');
        expect(loaded?.providers[0].apiKey).toBe('');
        expect(storage.loadConfig).toHaveBeenCalledWith(AI_CLOUD_CONFIG_KEY, 'a');
        expect(getAIConfig('a').systemPrompt).not.toBe('preference');
        setRuntimeAIConfig('a', loaded!); expect(getAIConfig('a').systemPrompt).toBe('preference');
    });
    it('does not acknowledge an in-flight cloud save to the next account', async () => {
        let finish!: () => void; storage.saveConfig.mockImplementation(() => new Promise<void>(done => { finish = done; }));
        const pending = saveCloudAIConfig('a', config(secret)); await vi.waitFor(() => expect(storage.saveConfig).toHaveBeenCalled());
        updateAuthSessionOwner('b'); finish(); expect(await pending).toBe(false);
        expect(storage.saveConfig.mock.calls[0][2]).toBe('a');
        expect(JSON.stringify(storage.saveConfig.mock.calls)).not.toContain(secret);
    });
});
