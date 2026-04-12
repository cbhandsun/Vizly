/**
 * 分享服务层
 * 封装所有云分享相关的 CRUD 操作
 */

import { supabase } from './supabase';

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

// === 分享服务 ===

class ShareService {
    /**
     * 为指定图表创建分享链接
     */
    async createShareLink(options: CreateShareOptions): Promise<ShareRecord> {
        const token = generateToken();

        const { data, error } = await supabase!
            .from('shared_diagrams')
            .insert({
                diagram_id: options.diagramId,
                share_token: token,
                created_by: options.userId,
                expires_at: options.expiresAt?.toISOString() ?? null,
                is_active: true,
            })
            .select()
            .single();

        if (error) throw error;
        return data as ShareRecord;
    }

    /**
     * 通过 share_token 获取分享的图表数据
     */
    async getSharedDiagram(token: string): Promise<{
        share: ShareRecord;
        diagram: any;
    } | null> {
        // 1. 查询分享记录
        const { data: share, error: shareError } = await supabase!
            .from('shared_diagrams')
            .select('*')
            .eq('share_token', token)
            .eq('is_active', true)
            .single();

        if (shareError || !share) return null;

        // 检查过期
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return null;
        }

        // 2. 加载图表内容
        const { data: diagram, error: diagramError } = await supabase!
            .from('diagrams')
            .select('*')
            .eq('id', share.diagram_id)
            .single();

        if (diagramError || !diagram) return null;

        return { share: share as ShareRecord, diagram };
    }

    /**
     * 查询指定图表的所有活跃分享链接
     */
    async listSharesForDiagram(diagramId: string): Promise<ShareRecord[]> {
        const { data, error } = await supabase!
            .from('shared_diagrams')
            .select('*')
            .eq('diagram_id', diagramId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as ShareRecord[];
    }

    /**
     * 撤销分享
     */
    async revokeShare(shareId: string): Promise<void> {
        const { error } = await supabase!
            .from('shared_diagrams')
            .update({ is_active: false })
            .eq('id', shareId);

        if (error) throw error;
    }

    /**
     * 构造公开分享 URL (用于基于 Token 的分享)
     */
    buildShareUrl(token: string): string {
        const base = window.location.origin;
        return `${base}/shared?token=${token}`;
    }

    // ==========================================
    // 定向协作 (Collaborators) 相关
    // ==========================================

    /**
     * 通过邮箱添加协作者（调用 RPC）
     */
    async addCollaborator(diagramId: string, email: string, role: 'viewer' | 'editor' = 'viewer'): Promise<{ success: boolean; user_id?: string; error?: string }> {
        const { data, error } = await supabase!.rpc('add_diagram_collaborator', {
            p_diagram_id: diagramId,
            p_target_email: email,
            p_role: role
        });

        if (error) {
            console.error('RPC Error:', error);
            throw new Error(error.message);
        }

        return data as any;
    }

    /**
     * 获取指定图表的协作者列表（包括其邮箱）
     */
    async listCollaborators(diagramId: string): Promise<CollaboratorRecord[]> {
        // 调用 RPC 获取关联了 auth.users 邮箱的列表
        const { data, error } = await supabase!.rpc('get_diagram_collaborators', {
            p_diagram_id: diagramId
        });

        if (error) {
            console.error('RPC Error:', error);
            throw new Error(error.message);
        }

        return (data || []) as CollaboratorRecord[];
    }

    /**
     * 移除协作者
     */
    async removeCollaborator(diagramId: string, targetUserId: string): Promise<void> {
        const { error } = await supabase!
            .from('diagram_collaborators')
            .delete()
            .eq('diagram_id', diagramId)
            .eq('user_id', targetUserId);
    }

    /**
     * 获取“与我共享”的图表列表
     */
    async listSharedWithMe(): Promise<any[]> {
        const { data, error } = await supabase!
            .from('diagram_collaborators')
            .select(`
                diagram_id,
                role,
                created_at,
                diagrams ( id, title, updated_at )
            `)
            .eq('user_id', (await supabase!.auth.getUser()).data.user?.id);

        if (error) throw error;

        // 映射为 DiagramMetadata 或类似的结构给前端用
        return (data || []).map((row: any) => {
            const diag = Array.isArray(row.diagrams) ? row.diagrams[0] : row.diagrams;
            return {
                id: diag?.id || row.diagram_id,
                title: diag?.title || 'Unknown Diagram',
                updatedAt: new Date(diag?.updated_at || row.created_at),
                role: row.role // 附带权限信息
            };
        });
    }
}

export const shareService = new ShareService();
