const MAX_NAVIGATOR_TEXT_LENGTH = 256;

type NavigatorNodeLike = {
    id: string;
    type?: string;
    data?: unknown;
};

type NavigatorNodeData = Record<string, unknown>;

export type NavigatorNodeTypeLabelKey = 'domainGroup' | 'subGroup' | 'note' | 'customNode';

const isRecord = (value: unknown): value is NavigatorNodeData =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readText = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAVIGATOR_TEXT_LENGTH);
};

const readNodeData = (node: NavigatorNodeLike): NavigatorNodeData =>
    isRecord(node.data) ? node.data : {};

export const resolveNavigatorNodeLabel = (node: NavigatorNodeLike): string => {
    const data = readNodeData(node);
    const label = readText(data.label);
    if (label) return label;

    if (node.type === 'titleGroup' || node.type === 'subGroup') {
        const groupLabel = readText(data.description) || readText(data.domain);
        if (groupLabel) return groupLabel.toLocaleUpperCase();
    }

    return readText(node.id) || 'Untitled';
};

export const resolveNavigatorNodeTypeLabelKey = (
    nodeType: string | undefined
): NavigatorNodeTypeLabelKey => {
    switch (nodeType) {
        case 'titleGroup':
            return 'domainGroup';
        case 'subGroup':
            return 'subGroup';
        case 'stickyNote':
        case 'note':
            return 'note';
        default:
            return 'customNode';
    }
};

export const resolveNavigatorSearchText = (node: NavigatorNodeLike): string => {
    const data = readNodeData(node);
    return [
        resolveNavigatorNodeLabel(node),
        readText(data.description),
        readText(data.domain),
        readText(node.id),
    ].filter(Boolean).join(' ').toLocaleLowerCase();
};
