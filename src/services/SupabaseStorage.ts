import { supabase } from './supabase';
import { IStorageProvider, DiagramMetadata, SavedDiagram, DiagramVersion } from './storage/types';
import { coerceRemoteDiagramContent } from './remoteDiagramContent';
import { coerceCloudConfigRows, coerceCloudConfigValue, normalizeCloudConfigKey } from './cloudConfigSecurity';
import { coerceVersionMessage, coerceVersionSnapshotData } from './versionSnapshotSecurity';

// Backward compatibility export (type mostly)
export type { SavedDiagram };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const coerceString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
};

const coerceTimestamp = (value: unknown): { iso: string; ms: number } | null => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) return null;
    return { iso: new Date(ms).toISOString(), ms };
};

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
        return this.normalizeSavedDiagram(data);
    }

    async listDiagrams(): Promise<DiagramMetadata[]> {
        const { data, error } = await supabase!
            .from('diagrams')
            .select('id, title, updated_at, user_id')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        return (Array.isArray(data) ? data : [])
            .map(item => this.coerceDiagramMetadata(item))
            .filter((item): item is DiagramMetadata => item !== null);
    }

    async loadDiagram(id: string): Promise<SavedDiagram> {
        const { data, error } = await supabase!
            .from('diagrams')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return this.normalizeSavedDiagram(data);
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
        if (!UUID_REGEX.test(diagramId)) {
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
        return this.coerceDiagramVersion(dbData, { includeSnapshot: true, requireSnapshot: true });
    }

    async listVersions(diagramId: string) {
        // Prevent UUID errors for string-based standard template IDs
        if (!UUID_REGEX.test(diagramId)) {
             return [];
        }

        const { data, error } = await supabase!
            .from('diagram_versions')
            .select('id, diagram_id, author_id, created_at, message') // Omit heavy snapshotData for list
            .eq('diagram_id', diagramId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (Array.isArray(data) ? data : [])
            .map(item => this.coerceDiagramVersion(item, { includeSnapshot: false, requireSnapshot: false }))
            .filter((item): item is DiagramVersion => item !== null);
    }

    async loadVersion(diagramId: string, versionId: string) {
        // Prevent UUID errors
        if (!UUID_REGEX.test(diagramId) || !UUID_REGEX.test(versionId)) {
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

        return this.coerceDiagramVersion(data, { includeSnapshot: true, requireSnapshot: true });
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
        const savedKey = isRecord(data) ? normalizeCloudConfigKey(data.key) : null;
        if (savedKey !== normalizedKey) {
            throw new Error('Supabase returned an invalid cloud config row.');
        }
        return {
            ...data,
            key: normalizedKey,
            value: coerceCloudConfigValue(normalizedKey, data.value),
        };
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

    private coerceDiagramMetadata(value: unknown): DiagramMetadata | null {
        if (!isRecord(value)) return null;
        const id = coerceString(value.id);
        if (!id) return null;
        const timestamp = coerceTimestamp(value.updated_at);
        if (!timestamp) return null;
        const title = coerceString(value.title) || id;
        const userId = coerceString(value.user_id) || undefined;

        return {
            id,
            title,
            updatedAt: new Date(timestamp.ms),
            userId,
        };
    }

    private coerceDiagramVersion(
        value: unknown,
        options: { includeSnapshot: boolean; requireSnapshot: boolean }
    ): DiagramVersion | null {
        if (!isRecord(value)) return null;
        const id = coerceString(value.id);
        const diagramId = coerceString(value.diagram_id);
        const timestamp = coerceTimestamp(value.created_at);
        if (!id || !diagramId || !UUID_REGEX.test(id) || !UUID_REGEX.test(diagramId) || !timestamp) {
            return null;
        }

        const snapshotData = options.includeSnapshot
            ? coerceVersionSnapshotData(value.snapshot_data)
            : null;
        if (options.requireSnapshot && !snapshotData) return null;

        return {
            id,
            diagramId,
            snapshotData,
            authorId: coerceString(value.author_id) || undefined,
            createdAt: timestamp.ms,
            message: coerceVersionMessage(value.message),
        };
    }

    private normalizeSavedDiagram(diagram: unknown): SavedDiagram {
        if (!isRecord(diagram)) {
            throw new Error('Supabase returned an invalid diagram row.');
        }
        const rawId = coerceString(diagram.id);
        const rawTitle = coerceString(diagram.title);
        const title = rawTitle || rawId || 'Untitled';
        const id = rawId || title;
        const content = coerceRemoteDiagramContent(diagram.content, { id, title });
        const timestamp = coerceTimestamp(diagram.updated_at);

        return {
            ...diagram,
            id,
            title: content.title || content.metadata?.title || content.name || title,
            content,
            updated_at: timestamp?.iso || new Date().toISOString(),
            user_id: coerceString(diagram.user_id) || 'anonymous',
        };
    }
}

// Singleton instance
export const supabaseStorage = new SupabaseStorageProvider();

// Legacy adapter to keep existing code working (temporarily)
export const storageService = supabaseStorage;

