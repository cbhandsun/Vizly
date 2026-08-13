import type { NodeObj } from 'mind-elixir';

import { findNodeById } from './migrate';

const MAX_CONTEXT_NODE_ID_LENGTH = 256;

const cleanCandidate = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const candidate = value.trim();
    if (!candidate || candidate.length > MAX_CONTEXT_NODE_ID_LENGTH) return null;
    return candidate;
};

export function resolveMindMapContextNodeId(
    root: NodeObj,
    candidates: readonly unknown[],
): string | null {
    for (const value of candidates.slice(0, 3)) {
        const candidate = cleanCandidate(value);
        if (!candidate) continue;

        if (findNodeById(root, candidate)) return candidate;

        const unprefixed = candidate.startsWith('me')
            ? cleanCandidate(candidate.slice(2))
            : null;
        if (unprefixed && findNodeById(root, unprefixed)) return unprefixed;
    }
    return null;
}
