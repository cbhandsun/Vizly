/**
 * Diagram Plugin Registry
 * Maps diagram types (from templates or legacy data) to their respective modern plugin IDs.
 * This decoupled registry provides a central point to orchestrate diagram plugins.
 */

// Bridge: diagram.type → plugin registry ID
// template type 值与 plugin.id 注册名之间存在历史差异，此映射表统一桥接
export const TYPE_TO_PLUGIN_ID: Record<string, string> = {
    'flowchart':    'flowchart',
    'mindmap':      'mindmap',
    'timeline':     'timeline-diagram',
    'architecture': 'architecture-diagram',
    'swimlane':     'swimlane-diagram',
    'er-diagram':   'er-diagram',
    'network':      'network',
    'sequence':     'sequence-diagram',
};

/**
 * Resolves a generic document type mapping to a specific plugin ID.
 * @param docType the historical diagram schema type
 * @returns plugin identifier
 */
export const resolvePluginId = (docType?: string): string | undefined => {
    if (!docType) return undefined;
    return TYPE_TO_PLUGIN_ID[docType];
};
