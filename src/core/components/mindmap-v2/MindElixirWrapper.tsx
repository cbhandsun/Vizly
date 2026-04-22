/**
 * MindElixirWrapper.tsx — Core integration component
 *
 * Embeds a mind-elixir instance inside the Vizly canvas.
 * Handles:
 *   - Lifecycle management (init / destroy)
 *   - Data load from PluginContext and save back on change
 *   - Keyboard shortcuts bridging (Ctrl+Z undo, Ctrl+Y redo)
 *   - Theme sync when Vizly theme changes
 *   - Context ref exposure via MindElixirContext
 */

import React, {
    useEffect,
    useRef,
    useContext,
    createContext,
    useCallback,
    useState,
} from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, MindElixirData } from 'mind-elixir';
import 'mind-elixir/style.css';

import { PluginContext } from '../../types/plugin';
import { VIZLY_HYPER_THEME, VIZLY_HYPER_DARK_THEME } from './theme';
import { migrateV1ToV2, directionStringToInt } from './migrate';
import { isMindMapV2 } from './types';

// ─── Default data shown for a fresh mindmap ──────────────────────────────────
const DEFAULT_DATA: MindElixirData = {
    nodeData: {
        id: 'root',
        topic: '中心主题',
        root: true,
        children: [
            { id: 'b1', topic: '分支一', children: [] },
            { id: 'b2', topic: '分支二', children: [] },
            { id: 'b3', topic: '分支三', children: [] },
        ],
    },
    direction: MindElixir.SIDE,
};

// ─── Context: expose mind-elixir instance to sibling components ───────────────
interface MindElixirContextValue {
    instance: MindElixirInstance | null;
}

export const MindElixirContext = createContext<MindElixirContextValue>({
    instance: null,
});

export function useMindElixir() {
    return useContext(MindElixirContext);
}

// ─── Debounce utility ─────────────────────────────────────────────────────────
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout>;
    return ((...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    }) as T;
}

// ─── Load / Save helpers ──────────────────────────────────────────────────────
function loadData(ctx: PluginContext): MindElixirData {
    try {
        const nodes = (ctx as any).getNodes?.() ?? [];
        const edges = (ctx as any).getEdges?.() ?? [];

        if (nodes.length === 0) return DEFAULT_DATA;

        // Detect v2 format stored in a special "meta" node
        const metaNode = nodes.find((n: any) => n.id === '__mindmap_meta__');
        if (metaNode?.data?.mindmapV2) {
            const v2 = metaNode.data.mindmapV2;
            if (isMindMapV2(v2)) {
                return {
                    nodeData: v2.nodeData,
                    direction: v2.direction ?? MindElixir.SIDE,
                    theme: v2.theme ?? VIZLY_HYPER_THEME,
                };
            }
        }

        // Fallback: migrate from v1 (RF nodes/edges)
        const mindmapNodes = nodes.filter((n: any) => n.type === 'mindmap');
        if (mindmapNodes.length === 0) return DEFAULT_DATA;

        const v2 = migrateV1ToV2({ nodes: mindmapNodes, edges });
        return {
            nodeData: v2.nodeData,
            direction: v2.direction ?? MindElixir.SIDE,
            theme: VIZLY_HYPER_THEME,
        };
    } catch {
        return DEFAULT_DATA;
    }
}

function saveData(ctx: PluginContext, mind: MindElixirInstance): void {
    try {
        const data = mind.getData();
        const v2Payload = {
            _version: 'mindmap-v2' as const,
            nodeData: data.nodeData,
            direction: data.direction ?? MindElixir.SIDE,
        };

        const setNodes = (ctx as any).setNodes;
        if (!setNodes) return;

        setNodes((prev: any[]) => {
            // Remove old meta node if present
            const filtered = prev.filter((n: any) => n.id !== '__mindmap_meta__');
            return [
                ...filtered,
                {
                    id: '__mindmap_meta__',
                    type: 'mindmap',
                    position: { x: -9999, y: -9999 }, // off-screen, invisible
                    hidden: true,
                    data: { mindmapV2: v2Payload, depth: -1, label: '' },
                },
            ];
        });
    } catch (e) {
        console.warn('[MindElixirWrapper] saveData failed:', e);
    }
}

// ─── Wrapper Component ────────────────────────────────────────────────────────
interface MindElixirWrapperProps {
    ctx: PluginContext;
    isDark?: boolean;
}

const MindElixirWrapper: React.FC<MindElixirWrapperProps> = ({ ctx, isDark }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mindRef = useRef<MindElixirInstance | null>(null);
    const [instance, setInstance] = useState<MindElixirInstance | null>(null);
    const saveRef = useRef<() => void>(() => {});

    // Keep save callback fresh without recreating the debounced fn
    saveRef.current = useCallback(() => {
        if (mindRef.current) saveData(ctx, mindRef.current);
    }, [ctx]);

    useEffect(() => {
        if (!containerRef.current) return;

        const initialData = loadData(ctx);
        const theme = isDark ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME;

        const mind = new MindElixir({
            el: containerRef.current,
            direction: (initialData.direction ?? MindElixir.SIDE) as any,
            draggable: true,
            contextMenu: false,
            toolBar: false,
            nodeMenu: false,
            keypress: true,
            locale: 'zh_CN',
            overflowHidden: false,
            mouseSelectionButton: 0,
            theme,
        });

        mind.init(initialData);
        mindRef.current = mind;
        setInstance(mind);

        // Debounced auto-save on every operation
        const debouncedSave = debounce(() => saveRef.current(), 800);
        mind.bus.addListener('operation', debouncedSave);

        // Also save on select (to capture no-op interactions that settle state)
        const debouncedSaveOnSelect = debounce(() => saveRef.current(), 2000);
        mind.bus.addListener('selectNode', debouncedSaveOnSelect);

        return () => {
            mind.bus.removeListener('operation', debouncedSave);
            mind.bus.removeListener('selectNode', debouncedSaveOnSelect);
            // mind-elixir doesn't have a formal destroy() — unmounting the div is enough
            mindRef.current = null;
            setInstance(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — only init once

    // Sync theme when dark mode changes
    useEffect(() => {
        if (!mindRef.current) return;
        mindRef.current.changeTheme(isDark ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME);
    }, [isDark]);

    return (
        <MindElixirContext.Provider value={{ instance }}>
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 10,
                    background: isDark ? '#0f172a' : '#f8fafc',
                    overflow: 'hidden',
                }}
            >
                <div
                    ref={containerRef}
                    id="vizly-mind-elixir-root"
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
        </MindElixirContext.Provider>
    );
};

export default MindElixirWrapper;
