// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => ({
    auth: {
        getUser: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
}));

vi.mock('../supabase', () => ({
    supabase: mockSupabase,
}));

describe('ShareService', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        window.history.replaceState({}, '', '/');
    });

    const createQueryMock = (result: any = { data: null, error: null }) => {
        const query: any = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            insert: vi.fn(() => query),
            update: vi.fn(() => query),
            order: vi.fn(() => query),
            single: vi.fn(() => Promise.resolve(result)),
            maybeSingle: vi.fn(() => Promise.resolve(result)),
        };
        return query;
    };

    it('does not query remote share data for malformed share tokens', async () => {
        const { shareService } = await import('../ShareService');

        await expect(shareService.getSharedDiagram('../bad-token')).resolves.toBeNull();

        expect(mockSupabase.rpc).not.toHaveBeenCalled();
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('coerces and sanitizes shared diagram content returned by the RPC', async () => {
        const share = {
            id: '44444444-4444-4444-8444-444444444444',
            diagram_id: '11111111-1111-4111-8111-111111111111',
            share_token: 'safe-token-123456',
            created_by: '22222222-2222-4222-8222-222222222222',
            expires_at: null,
            is_active: true,
            created_at: '2026-06-13T00:00:00.000Z',
        };
        mockSupabase.rpc.mockReturnValue({
            maybeSingle: vi.fn(() => Promise.resolve({
                data: {
                    share,
                    diagram: {
                        id: '11111111-1111-4111-8111-111111111111',
                        title: 'Shared fallback',
                        user_id: '33333333-3333-4333-8333-333333333333',
                        secret_note: 'internal only',
                        content: {
                            id: 'raw-id',
                            name: 'Shared Flow',
                            nodes: [{ id: 'n1', description: 'Node 1', domain: 'Core' }],
                            edges: [],
                            constructor: { polluted: true },
                            nested: { __proto__: { polluted: true }, safe: true },
                        },
                    },
                },
                error: null,
            })),
        });
        const { shareService } = await import('../ShareService');

        const result = await shareService.getSharedDiagram('safe-token-123456');

        expect(result?.share).toEqual(share);
        expect(result?.diagram.content).toMatchObject({
            id: 'raw-id',
            name: 'Shared Flow',
            nodes: [{ id: 'n1', description: 'Node 1', domain: 'Core' }],
        });
        expect(Object.hasOwn(result?.diagram.content ?? {}, 'constructor')).toBe(false);
        expect(Object.hasOwn(result?.diagram.content ?? {}, 'nested')).toBe(false);
        expect(result?.diagram).not.toHaveProperty('user_id');
        expect(result?.diagram).not.toHaveProperty('secret_note');
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('returns null when shared diagram content is not a valid diagram object', async () => {
        mockSupabase.rpc.mockReturnValue({
            maybeSingle: vi.fn(() => Promise.resolve({
                data: {
                    share: { id: 'share-id' },
                    diagram: {
                        id: '11111111-1111-4111-8111-111111111111',
                        title: 'Invalid diagram',
                        content: { name: 'Invalid', nodes: 'not-an-array' },
                    },
                },
                error: null,
            })),
        });
        const { shareService } = await import('../ShareService');

        await expect(shareService.getSharedDiagram('safe-token-123456')).resolves.toBeNull();
    });

    it('rejects RPC share rows that do not match the requested active token', async () => {
        const baseShare = {
            id: '44444444-4444-4444-8444-444444444444',
            diagram_id: '11111111-1111-4111-8111-111111111111',
            share_token: 'safe-token-123456',
            created_by: '22222222-2222-4222-8222-222222222222',
            expires_at: null,
            is_active: true,
            created_at: '2026-06-13T00:00:00.000Z',
        };
        const diagram = {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Shared fallback',
            content: {
                id: 'raw-id',
                name: 'Shared Flow',
                nodes: [{ id: 'n1', description: 'Node 1', domain: 'Core' }],
                edges: [],
            },
        };
        mockSupabase.rpc
            .mockReturnValueOnce({
                maybeSingle: vi.fn(() => Promise.resolve({
                    data: { share: { ...baseShare, share_token: 'other-token-123456' }, diagram },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                maybeSingle: vi.fn(() => Promise.resolve({
                    data: { share: { ...baseShare, is_active: false }, diagram },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                maybeSingle: vi.fn(() => Promise.resolve({
                    data: { share: { ...baseShare, expires_at: '2000-01-01T00:00:00.000Z' }, diagram },
                    error: null,
                })),
            });
        const { shareService } = await import('../ShareService');

        await expect(shareService.getSharedDiagram('safe-token-123456')).resolves.toBeNull();
        await expect(shareService.getSharedDiagram('safe-token-123456')).resolves.toBeNull();
        await expect(shareService.getSharedDiagram('safe-token-123456')).resolves.toBeNull();
    });

    it('builds hash-router share URLs and rejects invalid tokens', async () => {
        window.history.replaceState({}, '', '/vizly/workbench?draft=1#old');
        const { shareService } = await import('../ShareService');

        expect(shareService.buildShareUrl('safe-token-123456')).toBe('http://localhost:3000/vizly/workbench/#/shared?token=safe-token-123456');
        expect(() => shareService.buildShareUrl('bad token')).toThrow('Invalid share token');
    });

    it('rejects invalid collaborator emails before calling RPC', async () => {
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.addCollaborator('11111111-1111-4111-8111-111111111111', 'not-an-email', 'viewer')
        ).rejects.toThrow('Invalid collaborator email');

        expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('redacts collaborator RPC failures before logging them', async () => {
        const failure = {
            message: 'Authorization: Bearer sk-live-secret',
            code: '42501',
        };
        mockSupabase.rpc.mockResolvedValue({
            data: null,
            error: failure,
        });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.addCollaborator('11111111-1111-4111-8111-111111111111', 'user@example.com', 'viewer')
        ).rejects.toThrow('Authorization: Bearer sk-live-secret');

        expect(consoleErrorSpy).toHaveBeenCalledWith('RPC Error:', expect.anything());
        expect(JSON.stringify(consoleErrorSpy.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(consoleErrorSpy.mock.calls[0]?.[1])).not.toContain('sk-live-secret');
        consoleErrorSpy.mockRestore();
    });

    it('rejects malformed add-collaborator RPC responses', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: { ok: true, user_id: '22222222-2222-4222-8222-222222222222' },
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.addCollaborator('11111111-1111-4111-8111-111111111111', 'user@example.com', 'viewer')
        ).rejects.toThrow('invalid response');
    });

    it('coerces add-collaborator RPC responses', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                success: true,
                user_id: '22222222-2222-4222-8222-222222222222',
                ignored: 'server-internal',
            },
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.addCollaborator('11111111-1111-4111-8111-111111111111', 'user@example.com', 'viewer')
        ).resolves.toEqual({
            success: true,
            user_id: '22222222-2222-4222-8222-222222222222',
        });
    });

    it('surfaces collaborator removal RPC failures', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: { success: false, error: 'Only the diagram owner can manage collaborators' },
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.removeCollaborator(
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222'
            )
        ).rejects.toThrow('Only the diagram owner can manage collaborators');

        expect(mockSupabase.rpc).toHaveBeenCalledWith('remove_diagram_collaborator', {
            p_diagram_id: '11111111-1111-4111-8111-111111111111',
            p_target_user_id: '22222222-2222-4222-8222-222222222222',
        });
    });

    it('rejects empty collaborator removal RPC responses', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: null,
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.removeCollaborator(
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222'
            )
        ).rejects.toThrow('Failed to remove collaborator');
    });

    it('accepts collaborator removal only when the RPC reports success', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: { success: true },
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.removeCollaborator(
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222'
            )
        ).resolves.toBeUndefined();
    });

    it('filters malformed collaborator rows returned by the RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: [
                {
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    user_id: '22222222-2222-4222-8222-222222222222',
                    role: 'viewer',
                    added_by: '33333333-3333-4333-8333-333333333333',
                    created_at: '2026-06-13T00:00:00.000Z',
                    email: ' User@Example.COM ',
                },
                {
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    user_id: 'bad-user',
                    role: 'viewer',
                    added_by: '33333333-3333-4333-8333-333333333333',
                    created_at: '2026-06-13T00:00:00.000Z',
                    email: 'bad@example.com',
                },
                {
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    user_id: '44444444-4444-4444-8444-444444444444',
                    role: 'admin',
                    added_by: '33333333-3333-4333-8333-333333333333',
                    created_at: '2026-06-13T00:00:00.000Z',
                },
            ],
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(shareService.listCollaborators('11111111-1111-4111-8111-111111111111')).resolves.toEqual([
            {
                diagram_id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
                role: 'viewer',
                added_by: '33333333-3333-4333-8333-333333333333',
                created_at: '2026-06-13T00:00:00.000Z',
                email: 'user@example.com',
            },
        ]);
    });

    it('redacts collaborator listing RPC failures before logging them', async () => {
        const failure = {
            message: 'Authorization: Bearer sk-live-secret',
            code: '42501',
        };
        mockSupabase.rpc.mockResolvedValue({
            data: null,
            error: failure,
        });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.listCollaborators('11111111-1111-4111-8111-111111111111')
        ).rejects.toThrow('Authorization: Bearer sk-live-secret');

        expect(consoleErrorSpy).toHaveBeenCalledWith('RPC Error:', expect.anything());
        expect(JSON.stringify(consoleErrorSpy.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(consoleErrorSpy.mock.calls[0]?.[1])).not.toContain('sk-live-secret');
        consoleErrorSpy.mockRestore();
    });

    it('requires authentication before listing diagrams shared with the current user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: null },
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(shareService.listSharedWithMe()).rejects.toThrow('require authentication');
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('filters malformed rows when listing diagrams shared with the current user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const query = createQueryMock();
        query.eq.mockResolvedValueOnce({
            data: [
                {
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    role: 'viewer',
                    created_at: '2026-06-13T00:00:00.000Z',
                    diagrams: {
                        id: '11111111-1111-4111-8111-111111111111',
                        title: ' Shared Diagram ',
                        updated_at: '2026-06-14T00:00:00.000Z',
                    },
                },
                {
                    diagram_id: 'bad-id',
                    role: 'viewer',
                    created_at: '2026-06-13T00:00:00.000Z',
                    diagrams: null,
                },
                {
                    diagram_id: '33333333-3333-4333-8333-333333333333',
                    role: 'admin',
                    created_at: '2026-06-13T00:00:00.000Z',
                    diagrams: {
                        id: '33333333-3333-4333-8333-333333333333',
                        title: 'Bad Role',
                        updated_at: '2026-06-14T00:00:00.000Z',
                    },
                },
            ],
            error: null,
        });
        mockSupabase.from.mockReturnValue(query);
        const { shareService } = await import('../ShareService');

        await expect(shareService.listSharedWithMe()).resolves.toEqual([{
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Shared Diagram',
            updatedAt: new Date('2026-06-14T00:00:00.000Z'),
            role: 'viewer',
        }]);
        expect(query.eq).toHaveBeenCalledWith('user_id', '22222222-2222-4222-8222-222222222222');
    });

    it('requires share links to be created by the current authenticated user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.createShareLink({
                diagramId: '11111111-1111-4111-8111-111111111111',
                userId: '33333333-3333-4333-8333-333333333333',
            })
        ).rejects.toThrow('authenticated owner');

        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('rejects share link creation when the authenticated user does not own the diagram', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const diagramQuery = createQueryMock({
            data: {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '33333333-3333-4333-8333-333333333333',
            },
            error: null,
        });
        mockSupabase.from.mockReturnValue(diagramQuery);
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.createShareLink({
                diagramId: '11111111-1111-4111-8111-111111111111',
                userId: '22222222-2222-4222-8222-222222222222',
            })
        ).rejects.toThrow('authenticated diagram owner');

        expect(mockSupabase.from).toHaveBeenCalledWith('diagrams');
        expect(mockSupabase.from).not.toHaveBeenCalledWith('shared_diagrams');
    });

    it('checks diagram ownership before inserting a share link', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const diagramQuery = createQueryMock({
            data: {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
            },
            error: null,
        });
        const shareQuery = createQueryMock({
            data: {
                id: '44444444-4444-4444-8444-444444444444',
                diagram_id: '11111111-1111-4111-8111-111111111111',
                share_token: 'safe-token-123456',
                created_by: '22222222-2222-4222-8222-222222222222',
                expires_at: null,
                is_active: true,
                created_at: '2026-06-13T00:00:00.000Z',
            },
            error: null,
        });
        mockSupabase.from
            .mockReturnValueOnce(diagramQuery)
            .mockReturnValueOnce(shareQuery);
        const { shareService } = await import('../ShareService');

        await shareService.createShareLink({
            diagramId: '11111111-1111-4111-8111-111111111111',
            userId: '22222222-2222-4222-8222-222222222222',
        });

        expect(diagramQuery.select).toHaveBeenCalledWith('id,user_id');
        expect(diagramQuery.eq).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111');
        expect(shareQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
            diagram_id: '11111111-1111-4111-8111-111111111111',
            created_by: '22222222-2222-4222-8222-222222222222',
        }));
    });

    it('rejects invalid share records returned after creating a share link', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const diagramQuery = createQueryMock({
            data: {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
            },
            error: null,
        });
        const shareQuery = createQueryMock({
            data: {
                id: 'bad-share-id',
                diagram_id: '11111111-1111-4111-8111-111111111111',
                share_token: 'safe-token-123456',
                created_by: '22222222-2222-4222-8222-222222222222',
                expires_at: null,
                is_active: true,
                created_at: '2026-06-13T00:00:00.000Z',
            },
            error: null,
        });
        mockSupabase.from
            .mockReturnValueOnce(diagramQuery)
            .mockReturnValueOnce(shareQuery);
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.createShareLink({
                diagramId: '11111111-1111-4111-8111-111111111111',
                userId: '22222222-2222-4222-8222-222222222222',
            })
        ).rejects.toThrow('invalid share record');
    });

    it('filters malformed rows when listing shares for a diagram', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const diagramQuery = createQueryMock({
            data: {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
            },
            error: null,
        });
        const sharesQuery = createQueryMock();
        sharesQuery.order.mockResolvedValueOnce({
            data: [
                {
                    id: '44444444-4444-4444-8444-444444444444',
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    share_token: 'safe-token-123456',
                    created_by: '22222222-2222-4222-8222-222222222222',
                    expires_at: null,
                    is_active: true,
                    created_at: '2026-06-13T00:00:00.000Z',
                },
                {
                    id: '55555555-5555-4555-8555-555555555555',
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    share_token: 'expired-token-123456',
                    created_by: '22222222-2222-4222-8222-222222222222',
                    expires_at: '2000-01-01T00:00:00.000Z',
                    is_active: true,
                    created_at: '2026-06-13T00:00:00.000Z',
                },
                {
                    id: 'bad-id',
                    diagram_id: '11111111-1111-4111-8111-111111111111',
                    share_token: 'safe-token-abcdef',
                    created_by: '22222222-2222-4222-8222-222222222222',
                    expires_at: null,
                    is_active: true,
                    created_at: '2026-06-13T00:00:00.000Z',
                },
            ],
            error: null,
        });
        mockSupabase.from
            .mockReturnValueOnce(diagramQuery)
            .mockReturnValueOnce(sharesQuery);
        const { shareService } = await import('../ShareService');

        await expect(shareService.listSharesForDiagram('11111111-1111-4111-8111-111111111111')).resolves.toEqual([
            {
                id: '44444444-4444-4444-8444-444444444444',
                diagram_id: '11111111-1111-4111-8111-111111111111',
                share_token: 'safe-token-123456',
                created_by: '22222222-2222-4222-8222-222222222222',
                expires_at: null,
                is_active: true,
                created_at: '2026-06-13T00:00:00.000Z',
            },
        ]);
    });

    it('throws when revoking a share updates no rows', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const shareQuery = createQueryMock({
            data: {
                id: '44444444-4444-4444-8444-444444444444',
                diagram_id: '11111111-1111-4111-8111-111111111111',
            },
            error: null,
        });
        const diagramQuery = createQueryMock({
            data: {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
            },
            error: null,
        });
        const updateQuery = createQueryMock();
        updateQuery.select.mockResolvedValueOnce({ data: [], error: null });
        mockSupabase.from
            .mockReturnValueOnce(shareQuery)
            .mockReturnValueOnce(diagramQuery)
            .mockReturnValueOnce(updateQuery);
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.revokeShare('44444444-4444-4444-8444-444444444444')
        ).rejects.toThrow('was not revoked');

        expect(updateQuery.update).toHaveBeenCalledWith({ is_active: false });
        expect(updateQuery.eq).toHaveBeenCalledWith('id', '44444444-4444-4444-8444-444444444444');
        expect(updateQuery.select).toHaveBeenCalledWith('id');
    });

    it('confirms a share revoke by requiring one updated row', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
            error: null,
        });
        const shareQuery = createQueryMock({
            data: {
                id: '44444444-4444-4444-8444-444444444444',
                diagram_id: '11111111-1111-4111-8111-111111111111',
            },
            error: null,
        });
        const diagramQuery = createQueryMock({
            data: {
                id: '11111111-1111-4111-8111-111111111111',
                user_id: '22222222-2222-4222-8222-222222222222',
            },
            error: null,
        });
        const updateQuery = createQueryMock();
        updateQuery.select.mockResolvedValueOnce({
            data: [{ id: '44444444-4444-4444-8444-444444444444' }],
            error: null,
        });
        mockSupabase.from
            .mockReturnValueOnce(shareQuery)
            .mockReturnValueOnce(diagramQuery)
            .mockReturnValueOnce(updateQuery);
        const { shareService } = await import('../ShareService');

        await expect(
            shareService.revokeShare('44444444-4444-4444-8444-444444444444')
        ).resolves.toBeUndefined();
    });
});
