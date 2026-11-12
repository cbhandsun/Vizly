// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateAuthSessionOwner } from '../../context/authSessionBoundary';
import { bootstrapVersionOutbox } from '../bootstrapVersionOutbox';
let stop = () => {};
afterEach(() => { stop(); updateAuthSessionOwner(null); });
describe('deferred outbox startup', () => {
    it('does not load storage for anonymous visitors and initializes once after login', async () => {
        updateAuthSessionOwner(null);
        const dispose = vi.fn(); const install = vi.fn(() => dispose);
        const load = vi.fn(async () => ({ installVersionOutbox: install }));
        stop = bootstrapVersionOutbox(load, true);
        window.dispatchEvent(new Event('online'));
        expect(load).not.toHaveBeenCalled();
        updateAuthSessionOwner('a'); updateAuthSessionOwner('b');
        await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1));
        window.dispatchEvent(new Event('online')); expect(load).toHaveBeenCalledTimes(1);
        stop(); expect(dispose).toHaveBeenCalledTimes(1);
    });
    it('does not initialize a late module after its owner is disposed', async () => {
        updateAuthSessionOwner('a');
        let finish!: (module: { installVersionOutbox(): () => void }) => void;
        const install = vi.fn(() => vi.fn());
        stop = bootstrapVersionOutbox(() => new Promise(resolve => { finish = resolve; }), true);
        stop(); finish({ installVersionOutbox: install });
        await Promise.resolve(); expect(install).not.toHaveBeenCalled();
    });
    it('retries a failed import on reconnect without starting concurrent imports', async () => {
        updateAuthSessionOwner('a'); const install = vi.fn(() => vi.fn());
        const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ installVersionOutbox: install });
        stop = bootstrapVersionOutbox(load, true);
        await new Promise(resolve => setTimeout(resolve, 0));
        window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online'));
        await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1));
        expect(load).toHaveBeenCalledTimes(2);
    });
    it('keeps the rollback switch disabled across login and reconnect', () => {
        updateAuthSessionOwner('a'); const load = vi.fn();
        stop = bootstrapVersionOutbox(load, false);
        updateAuthSessionOwner('b'); window.dispatchEvent(new Event('online'));
        expect(load).not.toHaveBeenCalled();
    });
});
