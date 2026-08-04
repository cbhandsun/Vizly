// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    observe() { /* no-op */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
});
vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

const clipboardMocks = vi.hoisted(() => ({ copy: vi.fn() }));

vi.mock('@/components/shareClipboard', () => ({
    tryCopyShareUrl: clipboardMocks.copy,
}));

const translations: Record<string, string> = {
    'collaboration.modalTitle': '实时协作（Beta）',
    'collaboration.inviteLink': '邀请链接',
    'collaboration.copy': '复制',
    'collaboration.copied': '已复制',
    'collaboration.retryCopy': '重试复制',
    'collaboration.copyFailed': '未能复制链接',
    'collaboration.copyFallback': '邀请链接仍保留在上方，可手动复制。',
    'collaboration.inviteDescription': '将链接发送给团队成员。',
    'collaboration.currentOnline': '当前在线（0）',
    'collaboration.unknownUser': '未命名成员',
    'collaboration.localUser': '你',
    'collaboration.noOnlineUsers': '当前房间内没有在线成员',
    'collaboration.unavailable': '协作服务尚未配置',
    'collaboration.inviteStatus.unavailable': '此部署未配置实时协作服务，当前无法生成有效邀请。',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => translations[key] || key,
    }),
}));

import { CollaborationModal } from '../CollaborationModal';

describe('CollaborationModal commercial copy recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.history.replaceState({}, '', '/?diagram=11111111-1111-4111-8111-111111111111');
    });

    afterEach(() => cleanup());

    it('confirms a successful invite-link copy', async () => {
        clipboardMocks.copy.mockResolvedValue(true);
        render(<CollaborationModal open onClose={vi.fn()} activeUsers={[]} roomName="room-alpha" status="connected" />);

        fireEvent.click(await screen.findByRole('button', { name: '复制' }));

        expect(await screen.findByRole('button', { name: '已复制' })).toBeTruthy();
        expect(clipboardMocks.copy).toHaveBeenCalledWith(expect.stringContaining('room=room-alpha'));
    });

    it('keeps the invite link visible and offers retry when clipboard access fails', async () => {
        clipboardMocks.copy.mockResolvedValue(false);
        render(<CollaborationModal open onClose={vi.fn()} activeUsers={[]} roomName="room-alpha" status="connected" />);

        const linkInput = await screen.findByRole('textbox', { name: '邀请链接' });
        fireEvent.click(screen.getByRole('button', { name: '复制' }));

        expect(await screen.findByText('未能复制链接')).toBeTruthy();
        expect(screen.getByRole('button', { name: '重试复制' })).toBeTruthy();
        expect((linkInput as HTMLInputElement).value).toContain('room=room-alpha');
        await waitFor(() => expect(clipboardMocks.copy).toHaveBeenCalledTimes(1));
    });

    it('blocks dead invite links when the collaboration service is unavailable', async () => {
        render(<CollaborationModal open onClose={vi.fn()} activeUsers={[]} roomName="room-alpha" status="unavailable" />);

        expect(await screen.findByText('协作服务尚未配置')).toBeTruthy();
        expect(screen.getByText('此部署未配置实时协作服务，当前无法生成有效邀请。')).toBeTruthy();
        expect(screen.queryByRole('textbox', { name: '邀请链接' })).toBeNull();
        expect(screen.queryByRole('button', { name: '复制' })).toBeNull();
        expect(clipboardMocks.copy).not.toHaveBeenCalled();
    });
});
