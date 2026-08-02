/**
 * 分享服务层
 * 封装所有云分享相关的 CRUD 操作
 */

import { supabase } from './supabase';
import { coerceRemoteDiagramContent } from './remoteDiagramContent';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { parseCollaboratorEmail } from './shareInvitationBoundary';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

// === 类型定义 ===

export interface ShareRecord {
    id: string;
    diagram_id: string;
    share_token: string;
    created_by: string | null;
    expires_at: string | null;
    is_active: boolean;
    created_at: string;
}

export interface CreateShareOptions {
    diagramId: string;
    userId: string;
    /** 过期时间，null 表示永不过期 */
    expiresAt?: Date | null;
}

export interface CollaboratorRecord {
    diagram_id: string;
    user_id: string;
    role: 'viewer' | 'editor' | 'owner';
    added_by: string;
    created_at: string;
    email?: string; // 从 RPC 获取
}

export interface SharedWithMeRecord {
    id: string;
    title: string;
    updatedAt: Date;
    role: 'viewer' | 'editor' | 'owner';
}

export interface AddCollaboratorResult {
    success: boolean;
    user_id?: string;
    error?: string;
}

export interface SharedDiagramRecord {
    id: string;
    title: string;
    updated_at?: string;
    content: ReturnType<typeof coerceRemoteDiagramContent>;
}

// === Token 生成 ===

function generateToken(): string {
    // 生成 URL-safe 的随机 token（22 字符，约 132 位熵）
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map(b => b.toString(36).padStart(2, '0'))
        .join('')
        .slice(0, 22);
}

function isValidShareToken(token: string): boolean {
    return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

function isValidUuid(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

const getRemoteErrorCode = (error: unknown): string => {
    if (!isRecord(error) || typeof error.code !== 'string') return '';
    return error.code.trim();
};

const isMissingRpcError = (error: unknown): boolean => {
    const code = getRemoteErrorCode(error);
    return code === 'PGRST202' || code === '42883';
};

const isMissingRowError = (error: unknown): boolean => getRemoteErrorCode(error) === 'PGRST116';

const throwShareLookupFailure = (): never => {
    throw new Error('Shared diagram lookup is temporarily unavailable.');
};

function coerceSharedDiagram(diagram: unknown): SharedDiagramRecord | null {
    if (!isRecord(diagram) || !diagram.content) return null;

    try {
        const id = String(diagram.id || 'shared-diagram');
        const title = typeof diagram.title === 'string' ? diagram.title : 'Shared Diagram';
        const updatedAt = typeof diagram.updated_at === 'string' ? diagram.updated_at : undefined;
        return {
            id,
            title,
            ...(updatedAt ? { updated_at: updatedAt } : {}),
            content: coerceRemoteDiagramContent(diagram.content, {
                id,
                title,
            }),
        };
    } catch {
        return null;
    }
}

function coerceShareRecord(value: unknown, expectedToken?: string): ShareRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const diagramId = typeof row.diagram_id === 'string' ? row.diagram_id.trim() : '';
    const shareToken = typeof row.share_token === 'string' ? row.share_token.trim() : '';
    const createdBy = row.created_by === null
        ? null
        : typeof row.created_by === 'string'
            ? row.created_by.trim()
            : '';
    const expiresAt = row.expires_at === null
        ? null
        : typeof row.expires_at === 'string'
            ? row.expires_at
            : '';
    const createdAt = typeof row.created_at === 'string' ? row.created_at : '';

    if (!isValidUuid(id) || !isValidUuid(diagramId)) return null;
    if (!isValidShareToken(shareToken) || (expectedToken && shareToken !== expectedToken)) return null;
    if (createdBy !== null && !isValidUuid(createdBy)) return null;
    if (row.is_active !== true) return null;
    if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) return null;
    if (expiresAt !== null) {
        const expiresAtDate = new Date(expiresAt);
        if (Number.isNaN(expiresAtDate.getTime()) || expiresAtDate <= new Date()) return null;
    }

    return {
        id,
        diagram_id: diagramId,
        share_token: shareToken,
        created_by: createdBy,
        expires_at: expiresAt,
        is_active: true,
        created_at: createdAt,
    };
}

function coerceCollaboratorRecord(value: unknown): CollaboratorRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const diagramId = typeof row.diagram_id === 'string' ? row.diagram_id.trim() : '';
    const userId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
    const addedBy = typeof row.added_by === 'string' ? row.added_by.trim() : '';
    const role = row.role;
    const createdAt = typeof row.created_at === 'string' ? row.created_at : '';

    if (!isValidUuid(diagramId) || !isValidUuid(userId) || !isValidUuid(addedBy)) return null;
    if (role !== 'viewer' && role !== 'editor' && role !== 'owner') return null;
    if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) return null;

    const parsedEmail = parseCollaboratorEmail(row.email);
    return {
        diagram_id: diagramId,
        user_id: userId,
        role,
        added_by: addedBy,
        created_at: createdAt,
        ...(parsedEmail.ok ? { email: parsedEmail.email } : {}),
    };
}

function coerceSharedWithMeRecord(value: unknown): SharedWithMeRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const diagramId = typeof row.diagram_id === 'string' ? row.diagram_id.trim() : '';
    const role = row.role;
    const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
    const diagram = Array.isArray(row.diagrams) ? row.diagrams[0] : row.diagrams;
    const diagramRecord = diagram && typeof diagram === 'object' && !Array.isArray(diagram)
        ? diagram as Record<string, unknown>
        : {};
    const id = typeof diagramRecord.id === 'string' && isValidUuid(diagramRecord.id)
        ? diagramRecord.id
        : diagramId;
    const title = typeof diagramRecord.title === 'string' && diagramRecord.title.trim()
        ? diagramRecord.title.trim()
        : 'Unknown Diagram';
    const updatedAtRaw = typeof diagramRecord.updated_at === 'string'
        ? diagramRecord.updated_at
        : createdAt;
    const updatedAt = new Date(updatedAtRaw);

    if (!isValidUuid(id)) return null;
    if (role !== 'viewer' && role !== 'editor' && role !== 'owner') return null;
    if (Number.isNaN(updatedAt.getTime())) return null;

    return { id, title, updatedAt, role };
}

function coerceAddCollaboratorResult(value: unknown): AddCollaboratorResult | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (row.success !== true && row.success !== false) return null;

    const userId = typeof row.user_id === 'string' && isValidUuid(row.user_id.trim())
        ? row.user_id.trim()
        : undefined;
    const error = typeof row.error === 'string' && row.error.trim()
        ? row.error.trim().slice(0, 500)
        : undefined;

    if (row.success === true) {
        return {
            success: true,
            ...(userId ? { user_id: userId } : {}),
        };
    }

    return {
        success: false,
        error: error || 'Failed to add collaborator',
    };
}

// === 分享服务 ===

class ShareService {
    private async assertDiagramOwner(diagramId: string, userId: string): Promise<void> {
        const { data, error } = await supabase!
            .from('diagrams')
            .select('id,user_id')
            .eq('id', diagramId)
            .single();

        if (error || !data || data.user_id !== userId) {
            throw new Error('Share links require the authenticated diagram owner.');
        }
    }

    /**
     * 为指定图表创建分享链接
     */
    async createShareLink(options: CreateShareOptions): Promise<ShareRecord> {
        if (!isValidUuid(options.diagramId)) {
            throw new Error('Share links require a saved cloud diagram id.');
        }

        const { data: authData, error: authError } = await supabase!.auth.getUser();
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId || userId !== options.userId) {
            throw new Error('Share links require the authenticated owner.');
        }
        await this.assertDiagramOwner(options.diagramId, userId);

        const token = generateToken();

        const { data, error } = await supabase!
            .from('shared_diagrams')
            .insert({
                diagram_id: options.diagramId,
                share_token: token,
                created_by: userId,
                expires_at: options.expiresAt?.toISOString() ?? null,
                is_active: true,
            })
            .select()
            .single();

        if (error) throw error;

        const share = coerceShareRecord(data);
        if (!share) {
            throw new Error('Share link creation returned an invalid share record.');
        }
        return share;
    }

    /**
     * 通过 share_token 获取分享的图表数据
     */
    async getSharedDiagram(token: string, signal?: AbortSignal): Promise<{
        share: ShareRecord;
        diagram: SharedDiagramRecord;
    } | null> {
        const normalizedToken = token.trim();
        if (!isValidShareToken(normalizedToken)) return null;

        if (signal?.aborted) {
            throw new DOMException('Shared diagram lookup aborted.', 'AbortError');
        }

        const rpcQuery = supabase!
            .rpc('get_shared_diagram_by_token', { p_share_token: normalizedToken });
        const { data: rpcRow, error: rpcError } = signal
            ? await rpcQuery.abortSignal(signal).maybeSingle()
            : await rpcQuery.maybeSingle();

        if (!rpcError && isRecord(rpcRow) && rpcRow.share && rpcRow.diagram) {
            const share = coerceShareRecord(rpcRow.share, normalizedToken);
            if (!share) return null;

            const diagram = coerceSharedDiagram(rpcRow.diagram);
            if (!diagram) return null;

            return {
                share,
                diagram,
            };
        }

        // Older databases may not have the hardened RPC yet. Keep the legacy
        // path as a compatibility fallback; RLS will still decide access.
        if (rpcError && !isMissingRpcError(rpcError)) throwShareLookupFailure();

        let shareQuery = supabase!
            .from('shared_diagrams')
            .select('*')
            .eq('share_token', normalizedToken)
            .eq('is_active', true);
        if (signal) shareQuery = shareQuery.abortSignal(signal);
        const { data: share, error: shareError } = await shareQuery.single();

        if (shareError) {
            if (isMissingRowError(shareError)) return null;
            throwShareLookupFailure();
        }
        if (!share) return null;

        const safeShare = coerceShareRecord(share, normalizedToken);
        if (!safeShare) return null;

        // 2. 加载图表内容
        let diagramQuery = supabase!
            .from('diagrams')
            .select('*')
            .eq('id', safeShare.diagram_id);
        if (signal) diagramQuery = diagramQuery.abortSignal(signal);
        const { data: diagram, error: diagramError } = await diagramQuery.single();

        if (diagramError) {
            if (isMissingRowError(diagramError)) return null;
            throwShareLookupFailure();
        }
        if (!diagram) return null;

        const safeDiagram = coerceSharedDiagram(diagram);
        if (!safeDiagram) return null;

        return { share: safeShare, diagram: safeDiagram };
    }

    /**
     * 查询指定图表的所有活跃分享链接
     */
    async listSharesForDiagram(diagramId: string): Promise<ShareRecord[]> {
        if (!isValidUuid(diagramId)) return [];

        const { data: authData, error: authError } = await supabase!.auth.getUser();
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Share links require authentication.');
        await this.assertDiagramOwner(diagramId, userId);

        const { data, error } = await supabase!
            .from('shared_diagrams')
            .select('*')
            .eq('diagram_id', diagramId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (Array.isArray(data) ? data : [])
            .map(record => coerceShareRecord(record))
            .filter((record): record is ShareRecord => record !== null);
    }

    /**
     * 撤销分享
     */
    async revokeShare(shareId: string): Promise<void> {
        if (!isValidUuid(shareId)) {
            throw new Error('Invalid share id.');
        }

        const { data: authData, error: authError } = await supabase!.auth.getUser();
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Share links require authentication.');

        const { data: share, error: shareLoadError } = await supabase!
            .from('shared_diagrams')
            .select('id,diagram_id')
            .eq('id', shareId)
            .single();

        if (shareLoadError || !share?.diagram_id) {
            throw new Error('Share link not found.');
        }
        await this.assertDiagramOwner(share.diagram_id, userId);

        const { data, error } = await supabase!
            .from('shared_diagrams')
            .update({ is_active: false })
            .eq('id', shareId)
            .select('id');

        if (error) throw error;
        if (!Array.isArray(data) || data.length !== 1) {
            throw new Error('Share link was not revoked. It may not exist or you may not have permission to revoke it.');
        }
    }

    /**
     * 构造公开分享 URL (用于基于 Token 的分享)
     */
    buildShareUrl(token: string): string {
        const normalizedToken = token.trim();
        if (!isValidShareToken(normalizedToken)) {
            throw new Error('Invalid share token.');
        }

        const path = window.location.pathname || '/';
        const appPath = path.endsWith('/') ? path : `${path}/`;
        return `${window.location.origin}${appPath}#/shared?token=${encodeURIComponent(normalizedToken)}`;
    }

    // ==========================================
    // 定向协作 (Collaborators) 相关
    // ==========================================

    /**
     * 通过邮箱添加协作者（调用 RPC）
     */
    async addCollaborator(diagramId: string, email: string, role: 'viewer' | 'editor' = 'viewer'): Promise<AddCollaboratorResult> {
        if (!isValidUuid(diagramId)) {
            throw new Error('Collaborators require a saved cloud diagram id.');
        }
        const targetEmail = parseCollaboratorEmail(email);
        if (!targetEmail.ok) {
            throw new Error('Invalid collaborator email.');
        }
        if (role !== 'viewer' && role !== 'editor') {
            throw new Error('Invalid collaborator role.');
        }

        const { data, error } = await supabase!.rpc('add_diagram_collaborator', {
            p_diagram_id: diagramId,
            p_target_email: targetEmail.email,
            p_role: role
        });

        if (error) {
            safeLog.error('RPC Error:', redactSensitiveLogValue(error));
            throw new Error(error.message);
        }

        const result = coerceAddCollaboratorResult(data);
        if (!result) {
            throw new Error('Add collaborator returned an invalid response.');
        }
        return result;
    }

    /**
     * 获取指定图表的协作者列表（包括其邮箱）
     */
    async listCollaborators(diagramId: string): Promise<CollaboratorRecord[]> {
        if (!isValidUuid(diagramId)) return [];

        // 调用 RPC 获取关联了 auth.users 邮箱的列表
        const { data, error } = await supabase!.rpc('get_diagram_collaborators', {
            p_diagram_id: diagramId
        });

        if (error) {
            safeLog.error('RPC Error:', redactSensitiveLogValue(error));
            throw new Error(error.message);
        }

        return (Array.isArray(data) ? data : [])
            .map(coerceCollaboratorRecord)
            .filter((record): record is CollaboratorRecord => record !== null);
    }

    /**
     * 移除协作者
     */
    async removeCollaborator(diagramId: string, targetUserId: string): Promise<void> {
        if (!isValidUuid(diagramId) || !isValidUuid(targetUserId)) {
            throw new Error('Invalid collaborator removal request.');
        }

        const { data, error } = await supabase!.rpc('remove_diagram_collaborator', {
            p_diagram_id: diagramId,
            p_target_user_id: targetUserId,
        });

        if (error) throw error;
        if (data && data.success === false) {
            throw new Error(data.error || 'Failed to remove collaborator');
        }
        if (!data || data.success !== true) {
            throw new Error('Failed to remove collaborator');
        }
    }

    /**
     * 获取“与我共享”的图表列表
     */
    async listSharedWithMe(): Promise<SharedWithMeRecord[]> {
        const { data: authData, error: authError } = await supabase!.auth.getUser();
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Shared diagrams require authentication.');

        const { data, error } = await supabase!
            .from('diagram_collaborators')
            .select(`
                diagram_id,
                role,
                created_at,
                diagrams ( id, title, updated_at )
            `)
            .eq('user_id', userId);

        if (error) throw error;

        return (Array.isArray(data) ? data : [])
            .map(coerceSharedWithMeRecord)
            .filter((record): record is SharedWithMeRecord => record !== null);
    }
}

export const shareService = new ShareService();
