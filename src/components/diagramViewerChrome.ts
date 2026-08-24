const CENTER_ISLAND_HIDDEN_PLUGIN_IDS = new Set([
    'mindmap',
    'timeline-diagram',
]);

export const shouldHideDiagramViewerCenterIsland = (pluginId: unknown): boolean => (
    typeof pluginId === 'string' && CENTER_ISLAND_HIDDEN_PLUGIN_IDS.has(pluginId)
);
