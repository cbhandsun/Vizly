export interface DiagramViewerTemplateData {
    id?: string;
    name?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface RemoteDiagramSelection {
    id: string;
    title?: string;
    content: unknown;
}

export type DiagramViewerTemplateTranslationKey =
    | 'storage.manager.downloading'
    | 'storage.manager.noContent'
    | 'diagramViewer.cloudLoad.error';

export interface DiagramViewerTemplateSelectionDependencies {
    loadRemoteDiagram: (provider: 's3' | 'supabase', id: string) => Promise<RemoteDiagramSelection | null>;
    loadSystemTemplate: (id: string) => Promise<RemoteDiagramSelection | null>;
    loadStandardPreset: (id: string) => Promise<DiagramViewerTemplateData | null>;
    getLocalPreset: (id: string) => DiagramViewerTemplateData | null;
    parseRemoteContent: (
        content: unknown,
        fallback: { id: string; title?: string },
    ) => DiagramViewerTemplateData;
    seedAndNavigate: (data: DiagramViewerTemplateData, id: string) => Promise<void> | void;
    clearBlankTemplate: (id: string) => void;
    selectDiagram: (id: string) => void;
    showLoading: (message: string) => () => void;
    showError: (message: string) => void;
    logFailure: (source: string, id: string, error: unknown) => void;
    translate: (key: DiagramViewerTemplateTranslationKey, values?: { message?: string }) => string;
}

const MAX_SELECTION_VALUE_LENGTH = 200;

const normalizeSelectionValue = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (normalized.length > MAX_SELECTION_VALUE_LENGTH) return null;
    const hasControlCharacter = [...normalized].some((character) => {
        const codePoint = character.charCodeAt(0);
        return codePoint <= 31 || codePoint === 127;
    });
    return normalized && !hasControlCharacter ? normalized : null;
};

export const coerceRemoteDiagramSelection = (
    value: unknown,
    fallbackId: string,
): RemoteDiagramSelection | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const id = normalizeSelectionValue(record.id) ?? normalizeSelectionValue(fallbackId);
    if (!id || record.content === undefined || record.content === null) return null;
    const title = normalizeSelectionValue(record.title) ?? undefined;
    return { id, title, content: record.content };
};

const withRemoteMetadata = (
    parsed: DiagramViewerTemplateData,
    remote: RemoteDiagramSelection,
    provider?: 's3' | 'supabase',
): DiagramViewerTemplateData => ({
    ...parsed,
    id: remote.id,
    name: remote.title || parsed.name,
    metadata: {
        ...(parsed.metadata || {}),
        title: remote.title,
        ...(provider ? { cloud: { provider, id: remote.id, title: remote.title } } : {}),
    },
});

export async function selectDiagramViewerTemplate(
    leafKeyInput: unknown,
    rootGroupInput: unknown,
    dependencies: DiagramViewerTemplateSelectionDependencies,
): Promise<void> {
    const leafKey = normalizeSelectionValue(leafKeyInput);
    const rootGroup = normalizeSelectionValue(rootGroupInput) ?? '';
    if (!leafKey) return;

    if (rootGroup === 's3' || rootGroup === 'cloud' || rootGroup === 'supabase') {
        const provider = rootGroup === 's3' ? 's3' : 'supabase';
        const hideLoading = dependencies.showLoading(dependencies.translate('storage.manager.downloading'));
        try {
            const remote = await dependencies.loadRemoteDiagram(provider, leafKey);
            if (!remote?.content) {
                dependencies.showError(dependencies.translate('storage.manager.noContent'));
                return;
            }
            const parsed = dependencies.parseRemoteContent(remote.content, remote);
            await dependencies.seedAndNavigate(withRemoteMetadata(parsed, remote, provider), remote.id);
        } catch (error) {
            dependencies.logFailure(provider, leafKey, error);
            dependencies.showError(dependencies.translate('diagramViewer.cloudLoad.error', {
                message: error instanceof Error ? error.message : String(error),
            }));
        } finally {
            hideLoading();
        }
        return;
    }

    if (rootGroup === 'system-templates') {
        const hideLoading = dependencies.showLoading('正在加载云端模板...');
        try {
            const remote = await dependencies.loadSystemTemplate(leafKey);
            if (!remote?.content) {
                dependencies.showError(dependencies.translate('storage.manager.noContent'));
                return;
            }
            const parsed = dependencies.parseRemoteContent(remote.content, remote);
            await dependencies.seedAndNavigate(withRemoteMetadata(parsed, remote), remote.id);
        } catch (error) {
            dependencies.logFailure('system-templates', leafKey, error);
            dependencies.showError(`加载失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            hideLoading();
        }
        return;
    }

    if (rootGroup === 'local-workspace') {
        const localPreset = dependencies.getLocalPreset(leafKey);
        if (localPreset) {
            await dependencies.seedAndNavigate(localPreset, localPreset.id || leafKey);
            return;
        }
    }

    const preset = await dependencies.loadStandardPreset(leafKey);
    if (preset) {
        const id = preset.id || leafKey;
        await dependencies.seedAndNavigate({
            ...preset,
            id,
            metadata: { ...preset.metadata, title: preset.name },
        }, id);
        return;
    }

    dependencies.clearBlankTemplate(leafKey);
    dependencies.selectDiagram(leafKey);
}
