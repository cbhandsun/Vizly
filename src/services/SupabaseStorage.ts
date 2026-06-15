import { supabase } from './supabase';
import { IStorageProvider, DiagramMetadata, SavedDiagram } from './storage/types';
import { coerceRemoteDiagramContent } from './remoteDiagramContent';
import { coerceCloudConfigRows, coerceCloudConfigValue, normalizeCloudConfigKey } from './cloudConfigSecurity';
import { coerceVersionMessage, coerceVersionSnapshotData } from './versionSnapshotSecurity';

// Backward compatibility export (type mostly)
export type { SavedDiagram };

export class SupabaseStorageProvider implements IStorageProvider {
    name = 'Supabase Cloud';
    id = 'supabase' as const;

    isConfigured(): boolean {
        return Boolean(supabase);
    }

    private async requireAuthenticatedUser(expectedUserId?: string): Promise<string> {
        const { data: { user }, error } = await supabase!.auth.getUser();
        if (error) throw error;
        if (!user?.id) {
            throw new Error('Supabase storage requires an authenticated user.');
        }
        if (expectedUserId && expectedUserId !== 'anonymous' && expectedUserId !== user.id) {
            throw new Error('Supabase storage user mismatch.');
        }
        return user.id;
    }

    async saveDiagram(diagram: SavedDiagram): Promise<SavedDiagram> {
        const authenticatedUserId = await this.requireAuthenticatedUser();
        const ownerUserId = diagram.user_id && diagram.user_id !== 'anonymous'
            ? diagram.user_id
            : authenticatedUserId;
        const content = coerceRemoteDiagramContent(diagram.content, {
            id: diagram.id,
            title: diagram.title || diagram.id,
        });

        const { data, error } = await supabase!
            .from('diagrams')
            .upsert({
                id: diagram.id,
                title: diagram.title,
                content,
                user_id: ownerUserId,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw error;
        return this.normalizeSavedDiagram(data as SavedDiagram);
    }

    async listDiagrams(): Promise<DiagramMetadata[]> {
        const { data, error } = await supabase!
            .from('diagrams')
            .select('id, title, updated_at, user_id')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(item => ({
            id: item.id,
            title: item.title,
            updatedAt: new Date(item.updated_at),
            userId: item.user_id
        }));
    }

    async loadDiagram(id: string): Promise<SavedDiagram> {
        const { data, error } = await supabase!
            .from('diagrams')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return this.normalizeSavedDiagram(data as SavedDiagram);
    }

    async deleteDiagram(id: string): Promise<void> {
        await this.requireAuthenticatedUser();

        const { data, error } = await supabase!
            .from('diagrams')
            .delete()
            .eq('id', id)
            .select('id');

        if (error) throw error;
        if (!Array.isArray(data) || data.length !== 1) {
            throw new Error('Diagram was not deleted. It may not exist or you may not have permission to delete it.');
        }
    }

    // === Version History (GAP-05) ===
    async saveVersion(diagramId: string, data: any, message?: string) {
        // Prevent UUID errors for string-based standard template IDs
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(diagramId)) {
             throw new Error("Version history requires a saved Cloud Diagram (UUID format required).");
        }

        const { data: { user }, error: userError } = await supabase!.auth.getUser();
        if (userError) throw userError;
        if (!user?.id) {
            throw new Error('Version history requires an authenticated user.');
        }

        const safeSnapshotData = coerceVersionSnapshotData(data);
        const safeMessage = coerceVersionMessage(message);

        const { data: dbData, error } = await supabase!
            .from('diagram_versions')
            .insert({
                diagram_id: diagramId,
                snapshot_data: safeSnapshotData,
                message: safeMessage,
                author_id: user.id
            })
            .select()
            .single();
        if (error) throw error;
        return {
            id: dbData.id,
            diagramId: dbData.diagram_id,
            snapshotData: coerceVersionSnapshotData(dbData.snapshot_data),
            authorId: dbData.author_id,
            createdAt: new Date(dbData.created_at).getTime(),
            message: coerceVersionMessage(dbData.message)
        };
    }

    async listVersions(diagramId: string) {
        // Prevent UUID errors for string-based standard template IDs
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(diagramId)) {
             return [];
        }

        const { data, error } = await supabase!
            .from('diagram_versions')
            .select('id, diagram_id, author_id, created_at, message') // Omit heavy snapshotData for list
            .eq('diagram_id', diagramId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(item => ({
            id: item.id,
            diagramId: item.diagram_id,
            snapshotData: null, // Don't load snapshot data in list for performance
            authorId: item.author_id,
            createdAt: new Date(item.created_at).getTime(),
            message: coerceVersionMessage(item.message)
        }));
    }

    async loadVersion(diagramId: string, versionId: string) {
        // Prevent UUID errors
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(diagramId) || !uuidRegex.test(versionId)) {
             return null;
        }

        const { data, error } = await supabase!
            .from('diagram_versions')
            .select('*')
            .eq('id', versionId)
            .eq('diagram_id', diagramId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw error;
        }

        return {
            id: data.id,
            diagramId: data.diagram_id,
            snapshotData: coerceVersionSnapshotData(data.snapshot_data),
            authorId: data.author_id,
            createdAt: new Date(data.created_at).getTime(),
            message: coerceVersionMessage(data.message)
        };
    }

    // === Config specific to Supabase user configs ===
    async saveConfig(key: string, value: any, user_id: string) {
        const userId = await this.requireAuthenticatedUser(user_id);
        const normalizedKey = normalizeCloudConfigKey(key);
        if (!normalizedKey) throw new Error('Unsupported cloud config key');
        const normalizedValue = coerceCloudConfigValue(normalizedKey, value);

        const { data, error } = await supabase!
            .from('user_configs')
            .upsert({
                user_id: userId,
                key: normalizedKey,
                value: normalizedValue,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,key' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async loadConfig(key: string) {
        const userId = await this.requireAuthenticatedUser();
        const normalizedKey = normalizeCloudConfigKey(key);
        if (!normalizedKey) throw new Error('Unsupported cloud config key');

        const { data, error } = await supabase!
            .from('user_configs')
            .select('value')
            .eq('user_id', userId)
            .eq('key', normalizedKey)
            .limit(1);

        if (error) throw error;
        if (data && data.length > 0) return coerceCloudConfigValue(normalizedKey, data[0].value);
        return null;
    }

    async loadAllConfigs() {
        const userId = await this.requireAuthenticatedUser();

        const { data, error } = await supabase!
            .from('user_configs')
            .select('key, value')
            .eq('user_id', userId);
        if (error) throw error;
        return coerceCloudConfigRows(data || []);
    }

    private normalizeSavedDiagram(diagram: SavedDiagram): SavedDiagram {
        const title = typeof diagram.title === 'string' && diagram.title.trim()
            ? diagram.title.trim()
            : String(diagram.id || 'Untitled');
        const id = String(diagram.id || title);
        const content = coerceRemoteDiagramContent(diagram.content, { id, title });

        return {
            ...diagram,
            id,
            title: content.title || content.metadata?.title || content.name || title,
            content,
            updated_at: diagram.updated_at || new Date().toISOString(),
            user_id: diagram.user_id || 'anonymous',
        };
    }
}

// Singleton instance
export const supabaseStorage = new SupabaseStorageProvider();

// Legacy adapter to keep existing code working (temporarily)
export const storageService = supabaseStorage;

