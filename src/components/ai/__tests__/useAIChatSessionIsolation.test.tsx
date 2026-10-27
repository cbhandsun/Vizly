import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateAuthSessionOwner } from '@/context/authSessionBoundary';
import { clearRuntimeAIConfig, persistAIConfig } from '../aiConfigStorage';
import { useAIChatRequestLifecycle } from '../useAIChatRequestLifecycle';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/services/ai/aiRequestRouter', () => ({ requestAIChatCompletionRouted: mocks.request }));
const configure = () => persistAIConfig('a', { activeModelKey: 'provider:model', systemPrompt: '', providers: [{
    id: 'provider', name: 'Provider', enabled: true, baseUrl: 'https://example.com/v1', apiKey: 'synthetic-key',
    models: [{ id: 'model', name: 'Model', enabled: true }],
}] });
beforeEach(() => { updateAuthSessionOwner('a'); clearRuntimeAIConfig(); localStorage.clear(); vi.resetAllMocks(); configure(); });
const options = () => ({
    t: ((key: string) => key) as Parameters<typeof useAIChatRequestLifecycle>[0]['t'], userId: 'a', inputValue: 'hello',
    setInputValue: vi.fn(), setShowCommands: vi.fn(), activeId: null, messages: [], setConversations: vi.fn(),
    onOpenConfig: vi.fn(), processCommands: vi.fn(), diagramNodesRef: undefined, diagramEdgesRef: undefined, canvasOps: undefined,
});
describe('AI request session isolation', () => {
    it('forwards stop-generation cancellation into an in-flight command batch', async () => {
        mocks.request.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"commands"}}]}\n\ndata: [DONE]\n\n'));
        let complete!: () => void;
        const props = options();
        props.processCommands.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
        const { result } = renderHook(() => useAIChatRequestLifecycle(props));
        let pending!: Promise<void>;
        await act(async () => { pending = result.current.sendAIMessage(); });
        expect(props.processCommands).toHaveBeenCalledOnce();
        const signal = props.processCommands.mock.calls[0][1] as AbortSignal;
        expect(signal.aborted).toBe(false);
        act(() => { result.current.handleStopGeneration(); });
        expect(signal.aborted).toBe(true);
        await act(async () => { complete(); await pending; });
        expect(result.current.loading).toBe(false);
    });
    it('ignores a late success after account switch even when the provider ignores abort', async () => {
        let resolve!: (value: Response) => void;
        mocks.request.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
        const props = options(); const { result, rerender } = renderHook(({ userId }) => useAIChatRequestLifecycle({ ...props, userId }), { initialProps: { userId: 'a' } });
        let pending!: Promise<void>;
        act(() => { pending = result.current.sendAIMessage(); });
        expect(mocks.request).toHaveBeenCalledOnce();
        const signal = mocks.request.mock.calls[0][2].signal as AbortSignal;
        act(() => { updateAuthSessionOwner('b'); }); rerender({ userId: 'b' });
        expect(signal.aborted).toBe(true);
        await act(async () => { resolve(new Response('data: {"choices":[{"delta":{"content":"old reply"}}]}\n\ndata: [DONE]\n\n')); await pending; });
        expect(props.processCommands).not.toHaveBeenCalled(); expect(props.setConversations).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
    });
    it('unlocks the UI on a new session for the same user without accepting the old completion', async () => {
        let resolve!: (value: Response) => void;
        mocks.request.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
        const props = options(); const { result } = renderHook(() => useAIChatRequestLifecycle(props));
        let pending!: Promise<void>;
        act(() => { pending = result.current.sendAIMessage(); });
        expect(result.current.loading).toBe(true);
        act(() => { updateAuthSessionOwner('a', 'new-login'); });
        expect(result.current.loading).toBe(false);
        await act(async () => { resolve(new Response(null)); await pending; });
        expect(props.processCommands).not.toHaveBeenCalled();
    });
    it('allows a current-session response through the same path', async () => {
        mocks.request.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"current reply"}}]}\n\ndata: [DONE]\n\n'));
        const props = options(); const { result } = renderHook(() => useAIChatRequestLifecycle(props));
        await act(async () => { await result.current.sendAIMessage(); });
        expect(props.processCommands).toHaveBeenCalledWith('current reply', expect.any(AbortSignal));
        expect(result.current.loading).toBe(false);
    });
});
