import { describe, expect, it, vi } from 'vitest';
import { createInstance, type BackendModule } from 'i18next';
import { awaitLocaleInitialization } from '../localeInitialization';

describe('locale initialization readiness', () => {
    it('rejects an actual i18next backend failure even when init resolves', async () => {
        const instance = createInstance();
        const backend: BackendModule = {
            type: 'backend',
            init: () => {},
            read: (_language, _namespace, callback) => callback(new Error('private-token'), false),
        };
        const initialization = instance.use(backend).init({ lng: 'zh', fallbackLng: false });
        await expect(initialization).resolves.toBeTypeOf('function');
        await expect(awaitLocaleInitialization(initialization, () => instance.getResourceBundle('zh', 'translation')))
            .rejects.toThrow(/^Application locale initialization failed\.$/);
    });

    it('waits for initialization before reading the active bundle', async () => {
        let resolve: (() => void) | undefined;
        const initialization = new Promise<void>(done => { resolve = done; });
        const read = vi.fn(() => ({ common: { cancel: '取消' } }));
        const ready = awaitLocaleInitialization(initialization, read);
        expect(read).not.toHaveBeenCalled();
        resolve?.();
        await expect(ready).resolves.toBeUndefined();
        expect(read).toHaveBeenCalledOnce();
    });

    it.each([undefined, null, {}, { common: {} }, { message: '  ' }, [], { message: 42 }])(
        'rejects missing, empty and malformed resolved resources: %j', async resource => {
            await expect(awaitLocaleInitialization(Promise.resolve(), () => resource))
                .rejects.toThrow('Application locale initialization failed.');
        },
    );

    it('rejects unsafe keys and excessive resources without leaking their payload', async () => {
        const unsafe: unknown = JSON.parse('{"__proto__":{"private-token":"unsafe"}}');
        for (const resource of [unsafe, { message: 'private-token'.repeat(2000) }]) {
            await expect(awaitLocaleInitialization(Promise.resolve(), () => resource))
                .rejects.toThrow(/^Application locale initialization failed\.$/);
        }
    });

    it('propagates rejected initialization as a safe failure without reading resources', async () => {
        const read = vi.fn();
        await expect(awaitLocaleInitialization(Promise.reject(new Error('private-token')), read))
            .rejects.toThrow(/^Application locale initialization failed\.$/);
        expect(read).not.toHaveBeenCalled();
    });

    it('classifies a throwing resource reader as failed readiness', async () => {
        await expect(awaitLocaleInitialization(Promise.resolve(), () => { throw new Error('private-token'); }))
            .rejects.toThrow(/^Application locale initialization failed\.$/);
    });
});
