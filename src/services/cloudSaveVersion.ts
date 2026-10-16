import { parseCloudDiagramRevision } from './cloudDiagramRevision';
import { parseS3ObjectRevision } from './s3ObjectRevision';

export class CloudSaveVersionError extends Error {
    constructor(message: string) { super(message); this.name = 'CloudSaveVersionError'; }
}

/** Loading legacy records may lack a revision; captureCloudSaveVersion then blocks overwrite. */
export const readLoadedCloudRevision = (provider: string, loaded: unknown): string | undefined => {
    const data = record(loaded);
    return provider === 's3' ? parseS3ObjectRevision(data?.expectedRevision)
        : provider === 'supabase' ? parseCloudDiagramRevision(data?.updated_at) ?? undefined : undefined;
};

const record = (value: unknown): Record<string, unknown> | null => value !== null
    && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Capture from the loaded view before awaiting snapshot work, never from a fresh read. */
export const captureCloudSaveVersion = (provider: string, targetId: string, cloud: unknown) => {
    if (provider !== 'supabase' && provider !== 's3') return undefined;
    const metadata = record(cloud);
    if (metadata?.provider !== provider || metadata.id !== targetId) return undefined;
    const revision = provider === 's3' ? parseS3ObjectRevision(metadata.revision) : parseCloudDiagramRevision(metadata.revision);
    if (!revision) throw new CloudSaveVersionError('云端图表缺少加载版本，请保留编辑并重新打开，或另存为副本');
    return revision;
};

export const readSavedCloudRevision = (provider: string, saved: unknown): string | undefined => {
    if (provider !== 'supabase' && provider !== 's3') return undefined;
    const revision = provider === 's3' ? parseS3ObjectRevision(record(saved)?.expectedRevision)
        : parseCloudDiagramRevision(record(saved)?.updated_at);
    if (!revision) throw new CloudSaveVersionError('云端未返回有效保存版本，请重新打开图表确认保存结果');
    return revision;
};

export const assertCloudSaveViewCurrent = (
    bridge: { id?: string; metadata?: Record<string, unknown> },
    capturedId: string | undefined,
    capturedCloud: unknown,
    capturedRevision: string | undefined,
) => {
    const currentCloud = bridge.metadata?.cloud;
    if (bridge.id !== capturedId || currentCloud !== capturedCloud
        || (capturedRevision !== undefined && record(currentCloud)?.revision !== capturedRevision)) {
        throw new CloudSaveVersionError('保存期间图表或版本已切换，请重试；本地编辑已保留');
    }
};
