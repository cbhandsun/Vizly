import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIConfigState } from '../aiConfigStorage';

const mocks = vi.hoisted(() => ({
    loadCloudAIConfig: vi.fn(),
    setRuntimeAIConfig: vi.fn(),
    logFailure: vi.fn(),
}));

vi.mock('../aiConfigStorage', async importOriginal => ({
    ...await importOriginal<typeof import('../aiConfigStorage')>(),
    loadCloudAIConfig: mocks.loadCloudAIConfig,
    setRuntimeAIConfig: mocks.setRuntimeAIConfig,
}));

vi.mock('../aiLogging', () => ({
    logAIConfigModalCloudLoadFailure: mocks.logFailure,
}));

import { useAIConfigCloudDraftSync } from '../useAIConfigCloudDraftSync';

const cloudConfig: AIConfigState = {
    activeModelKey: '',
    systemPrompt: 'cloud',
    providers: [],
};

afterEach(() => vi.clearAllMocks());

describe('useAIConfigCloudDraftSync', () => {
    it('loads only for an open signed-in draft and applies a pristine response', async () => {
        mocks.loadCloudAIConfig.mockResolvedValue(cloudConfig);
        const replace = vi.fn(() => true);
        const eventListener = vi.fn();
        window.addEventListener('aiConfigChanged', eventListener);

        renderHook(() => useAIConfigCloudDraftSync(true, 'user-1', replace));

        await waitFor(() => expect(replace).toHaveBeenCalledWith(cloudConfig));
        expect(mocks.setRuntimeAIConfig).toHaveBeenCalledWith('user-1', cloudConfig);
        expect(eventListener).toHaveBeenCalledTimes(1);
        window.removeEventListener('aiConfigChanged', eventListener);
    });

    it('does not overwrite a dirty draft or apply a response after cleanup', async () => {
        let resolveCloud: (value: AIConfigState) => void = () => undefined;
        mocks.loadCloudAIConfig.mockReturnValue(new Promise(resolve => { resolveCloud = resolve; }));
        const replace = vi.fn(() => false);
        const { unmount } = renderHook(() => useAIConfigCloudDraftSync(true, 'user-1', replace));
        unmount();
        resolveCloud(cloudConfig);
        await Promise.resolve();

        expect(replace).not.toHaveBeenCalled();
        expect(mocks.setRuntimeAIConfig).not.toHaveBeenCalled();
    });

    it('skips cloud loading while closed or anonymous', () => {
        const replace = vi.fn(() => true);
        const { rerender } = renderHook(
            ({ open, userId }) => useAIConfigCloudDraftSync(open, userId, replace),
            { initialProps: { open: false, userId: 'user-1' as string | undefined } },
        );
        rerender({ open: true, userId: undefined });
        expect(mocks.loadCloudAIConfig).not.toHaveBeenCalled();
    });
});
