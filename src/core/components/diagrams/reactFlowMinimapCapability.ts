import type { DiagramTypePlugin } from '@/core/types/plugin';

type MinimapCapability = Pick<DiagramTypePlugin, 'hideMiniMap'>;

/**
 * The unified minimap reads React Flow nodes. Plugins that render their own
 * canvas must opt out when those nodes cannot represent the visible diagram.
 */
export function supportsReactFlowMinimap(
    plugin: MinimapCapability | null | undefined,
): boolean {
    return plugin?.hideMiniMap !== true;
}
