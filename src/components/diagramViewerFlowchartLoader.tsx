import React from 'react';

import { ensureBuiltInPlugins } from '@vizly/core/plugins';
import type { DiagramComponentProps } from '@vizly/core/types';

const rendererCache = new Map<string, React.LazyExoticComponent<React.ComponentType<DiagramComponentProps>>>();
const MAX_CACHED_RENDERERS = 64;

/** Keep lazy identity across suspended route retries; useMemo is discarded before commit. */
export const getFlowchartDesignerComponent = (pluginId?: string, presetId?: string) => {
    // The renderer already defaults to flowchart. A later type lookup must not
    // replace that same canvas and its document bridge with another lazy wrapper.
    const effectivePluginId = pluginId || 'flowchart';
    const key = JSON.stringify([effectivePluginId, presetId ?? null]);
    const cached = rendererCache.get(key);
    if (cached) {
        rendererCache.delete(key);
        rendererCache.set(key, cached);
        return cached;
    }
    const component = React.lazy(() => loadFlowchartDesigner(effectivePluginId, presetId));
    rendererCache.set(key, component);
    if (rendererCache.size > MAX_CACHED_RENDERERS) {
        const oldest = rendererCache.keys().next().value;
        if (oldest !== undefined) rendererCache.delete(oldest);
    }
    return component;
};

export const PLUGIN_EMPTY_CANVAS_IDS = new Set(['flowchart']);

export const loadFlowchartDesigner = async (pluginId?: string, presetId?: string) => {
    const precompiledRouteReady = presetId
        ? import('@vizly/core/routing-runtime')
            .then(
                module => module.prefetchBaseReactFlowPrecompiledRoute(presetId),
                () => false,
            )
        : Promise.resolve(false);
    const [{ FlowchartDesigner }] = await Promise.all([
        import('@vizly/core/react'),
        ensureBuiltInPlugins(pluginId || 'flowchart'),
        precompiledRouteReady,
    ]);

    return {
        default: (props: DiagramComponentProps) => React.createElement(
            FlowchartDesigner,
            pluginId ? { ...props, pluginId } : props,
        ),
    };
};
