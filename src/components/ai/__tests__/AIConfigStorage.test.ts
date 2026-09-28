import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('@vizly/core/logging', async (importOriginal) => ({
  ...await importOriginal<typeof import('@vizly/core/logging')>(),
    safeLog: safeLogState,
}));
import {
    AI_CONFIG_KEY,
    clearRuntimeAIConfig,
    coerceAIConfig,
    getAIConfig,
    getAIConfigKey,
    persistAIConfig,
    parseStoredAIConfig,
    type AIConfigState,
} from '../aiConfigStorage';

const LOGGED_IN_API_KEY_CANARY = ['sk', 'live-user', 'canary'].join('-');
const ANONYMOUS_API_KEY_CANARY = ['sk', 'anonymous', 'canary'].join('-');
const LEGACY_API_KEY_CANARY = ['legacy', 'api-key', 'canary'].join('-');
const RUNTIME_API_KEY_CANARY = ['sk', 'runtime', 'canary'].join('-');
const WRITE_FAILURE_CANARY = ['ai-config', 'write', 'canary'].join('-');
const SCOPED_READ_FAILURE_CANARY = ['scoped', 'ai-config', 'canary'].join('-');
const LEGACY_READ_FAILURE_CANARY = ['legacy', 'ai-config', 'canary'].join('-');

const makeConfig = (apiKey: string, systemPrompt = 'private prompt'): AIConfigState => ({
    activeModelKey: 'openai:gpt-4o',
    systemPrompt,
    providers: [{
        id: 'openai',
        name: 'OpenAI',
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKey,
        models: [{ id: 'gpt-4o', name: 'GPT-4o', enabled: true }],
    }],
});

describe('AI config storage isolation', () => {
    beforeEach(() => {
        localStorage.clear();
        clearRuntimeAIConfig();
        delete (window as any).__currentUserId;
        Object.values(safeLogState).forEach(mock => mock.mockReset());
    });

    it('does not load another user-scoped config when no current user is known', () => {
        localStorage.setItem(getAIConfigKey('user-a'), JSON.stringify(makeConfig('', 'user-a prompt')));

        const anonymousConfig = getAIConfig();

        expect(anonymousConfig.systemPrompt).not.toBe('user-a prompt');
        expect(anonymousConfig.activeModelKey).toBe('gemini:gemini-2.0-flash-exp');
    });

    it('uses the explicit current user hint without scanning unrelated user keys', () => {
        localStorage.setItem(getAIConfigKey('user-a'), JSON.stringify(makeConfig('', 'user-a prompt')));
        localStorage.setItem(getAIConfigKey('user-b'), JSON.stringify(makeConfig('', 'user-b prompt')));
        (window as any).__currentUserId = 'user-b';

        const currentUserConfig = getAIConfig();

        expect(currentUserConfig.systemPrompt).toBe('user-b prompt');
    });

    it('strips logged-in API keys from localStorage while keeping runtime access', () => {
        persistAIConfig('user-a', makeConfig(LOGGED_IN_API_KEY_CANARY));

        const persisted = JSON.parse(localStorage.getItem(`${AI_CONFIG_KEY}_user-a`) || '{}');
        expect(persisted.providers[0].apiKey).toBe('');
        expect(getAIConfig('user-a').providers[0].apiKey).toBe(LOGGED_IN_API_KEY_CANARY);
    });

    it('coerces malformed stored providers before returning config', () => {
        localStorage.setItem(getAIConfigKey('user-a'), JSON.stringify({
            activeModelKey: 'evil:<script>',
            systemPrompt: 'x'.repeat(25_000),
            providers: [{
                id: '<script>',
                name: '',
                enabled: true,
                baseUrl: 'http://evil.example/v1',
                apiKey: 'k'.repeat(9_000),
                constructor: { polluted: true },
                models: [
                    { id: 'safe/model-1', name: 'Safe', enabled: true, group: 'Main', onclick: 'bad' },
                    { id: '<bad>', name: 'Bad', enabled: true },
                    null,
                ],
            }],
        }));

        const config = getAIConfig('user-a');

        expect(config.systemPrompt).toHaveLength(20_000);
        expect(config.providers).toHaveLength(1);
        expect(config.providers[0]).toEqual({
            id: 'provider-0',
            name: 'provider-0',
            enabled: true,
            baseUrl: '',
            apiKey: 'k'.repeat(8_000),
            models: [
                { id: 'safe/model-1', name: 'Safe', group: 'Main', enabled: true },
                { id: 'model-1', name: 'Bad', enabled: true },
            ],
        });
        expect(Object.hasOwn(config.providers[0] as unknown as Record<string, unknown>, 'constructor')).toBe(false);
        expect(config.activeModelKey).toBe('provider-0:safe/model-1');
    });

    it('normalizes anonymous persisted config while preserving local API keys', () => {
        persistAIConfig(null, {
            ...makeConfig(ANONYMOUS_API_KEY_CANARY),
            providers: [{
                ...makeConfig(ANONYMOUS_API_KEY_CANARY).providers[0],
                baseUrl: 'https://api.openai.com/v1/',
            }],
        });

        const persisted = JSON.parse(localStorage.getItem(getAIConfigKey()) || '{}');
        expect(persisted.providers[0].apiKey).toBe(ANONYMOUS_API_KEY_CANARY);
        expect(persisted.providers[0].baseUrl).toBe('https://api.openai.com/v1');
    });

    it('falls back to defaults when config is not an object', () => {
        const config = coerceAIConfig(null);

        expect(config.activeModelKey).toBe('gemini:gemini-2.0-flash-exp');
        expect(config.providers.length).toBeGreaterThan(0);
        expect(config.providers[0].models.length).toBeGreaterThan(0);
    });

    it('continues legacy migration when the scoped config is malformed', () => {
        localStorage.setItem(getAIConfigKey('user-a'), '{broken');
        localStorage.setItem('DiagramView.AIConfig', JSON.stringify({
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            apiKey: LEGACY_API_KEY_CANARY,
        }));

        const config = getAIConfig('user-a');
        const gemini = config.providers.find(provider => provider.id === 'gemini');

        expect(config.activeModelKey).toBe('gemini:gemini-2.0-flash-exp');
        expect(gemini?.apiKey).toBe(LEGACY_API_KEY_CANARY);
    });

    it('ignores malformed or oversized legacy config and returns defaults', () => {
        localStorage.setItem(getAIConfigKey('user-a'), '{broken');
        localStorage.setItem('DiagramView.AIConfig', '{also broken');

        expect(getAIConfig('user-a').activeModelKey).toBe('gemini:gemini-2.0-flash-exp');
        expect(parseStoredAIConfig('x'.repeat(2 * 1024 * 1024 + 1))).toBeNull();
    });

    it('logs and keeps runtime config when persisting AI config fails', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error(`Authorization: Bearer ${WRITE_FAILURE_CANARY}`);
        });

        expect(() => persistAIConfig('user-a', makeConfig(RUNTIME_API_KEY_CANARY))).not.toThrow();
        expect(getAIConfig('user-a').providers[0].apiKey).toBe(RUNTIME_API_KEY_CANARY);
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[aiConfigStorage] persistAIConfig failed:',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain(WRITE_FAILURE_CANARY);
    });

    it('logs and falls back when scoped AI config storage read throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            if (key === getAIConfigKey('user-a')) {
                throw new Error(`token=${SCOPED_READ_FAILURE_CANARY}`);
            }
            return null;
        });

        const config = getAIConfig('user-a');

        expect(config.activeModelKey).toBe('gemini:gemini-2.0-flash-exp');
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[aiConfigStorage] getAIConfig.readScopedConfig failed:',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain(SCOPED_READ_FAILURE_CANARY);
    });

    it('logs and falls back when legacy AI config storage read throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            if (key === getAIConfigKey('user-a')) {
                return null;
            }
            if (key === 'DiagramView.AIConfig') {
                throw new Error(`cookie=${LEGACY_READ_FAILURE_CANARY}`);
            }
            return null;
        });

        const config = getAIConfig('user-a');

        expect(config.activeModelKey).toBe('gemini:gemini-2.0-flash-exp');
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[aiConfigStorage] getAIConfig.readLegacyConfig failed:',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain(LEGACY_READ_FAILURE_CANARY);
    });
});
