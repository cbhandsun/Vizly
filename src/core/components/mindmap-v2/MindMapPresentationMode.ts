/**
 * MindMapPresentationMode.tsx — 演示 / Pitch 模式
 *
 * 用法：在 Toolbar 点击"演示"按钮进入
 *
 * 逻辑：
 *  1. 全屏 #vizly-mind-elixir-root 容器
 *  2. 所有节点半透明，当前节点高亮+放大
 *  3. ← → / Space / Enter 逐节点遍历（DFS）
 *  4. Escape 退出
 */

import { useCallback, useEffect, useRef } from 'react';
import type { NodeObj } from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';

// ─── DFS 遍历节点 ─────────────────────────────────────────────────────────────
function flattenNodesDFS(node: NodeObj, result: string[] = []): string[] {
    result.push(node.id);
    if (node.expanded !== false) {
        for (const child of node.children ?? []) {
            flattenNodesDFS(child, result);
        }
    }
    return result;
}

// ─── CSS 注入 ─────────────────────────────────────────────────────────────────
const PRES_STYLE_ID = 'me-presentation-style';

function injectPresentationCSS() {
    if (document.getElementById(PRES_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PRES_STYLE_ID;
    style.textContent = `
        /* 演示模式：非选中节点变暗 */
        .me-presenting .map-container me-tpc:not(.selected) {
            opacity: 0.18 !important;
            filter: blur(0.3px) !important;
            transition: opacity 0.3s ease, filter 0.3s ease !important;
        }
        /* 选中节点：放大 + 强光晕 */
        .me-presenting .map-container me-tpc.selected {
            opacity: 1 !important;
            filter: none !important;
            transform: scale(1.18) translateY(-3px) !important;
            box-shadow: 0 0 0 4px #6366f1,
                        0 6px 40px rgba(99,102,241,0.45),
                        0 0 80px rgba(99,102,241,0.2) !important;
            z-index: 99 !important;
            transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1) !important;
        }
        /* 演示模式 HUD */
        #me-presentation-hud {
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            background: rgba(15,15,20,0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            padding: 10px 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            color: #fff;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
            user-select: none;
        }
        #me-presentation-hud .hud-topic {
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 500;
        }
        #me-presentation-hud .hud-counter {
            color: rgba(255,255,255,0.5);
            font-size: 11px;
        }
        #me-presentation-hud .hud-sep {
            width: 1px;
            height: 16px;
            background: rgba(255,255,255,0.15);
        }
        #me-presentation-hud kbd {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 5px;
            padding: 2px 6px;
            font-size: 11px;
            font-family: monospace;
        }
    `;
    document.head.appendChild(style);
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
const createHudSpan = (className: string, text?: string): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = className;
    if (text !== undefined) span.textContent = text;
    return span;
};

const createHudKey = (text: string): HTMLElement => {
    const key = document.createElement('kbd');
    key.textContent = text;
    return key;
};

export function showPresentationHUD(topic: string, index: number, total: number) {
    let hud = document.getElementById('me-presentation-hud');
    if (!hud) {
        hud = document.createElement('div');
        hud.id = 'me-presentation-hud';
        document.body.appendChild(hud);
    }

    const nav = document.createDocumentFragment();
    nav.append(createHudKey('←'), createHudKey('→'), document.createTextNode(' 导航 \u00a0 '), createHudKey('Esc'), document.createTextNode(' 退出'));

    hud.replaceChildren(
        createHudSpan('hud-counter', `${index + 1} / ${total}`),
        createHudSpan('hud-sep'),
        createHudSpan('hud-topic', topic),
        createHudSpan('hud-sep'),
        nav
    );
}

function removeHUD() {
    document.getElementById('me-presentation-hud')?.remove();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export interface PresentationController {
    isActive: boolean;
    start: () => void;
    stop: () => void;
}

export function usePresentationMode(
    mind: MindElixirInstance | null,
    onStop?: () => void,
    onNodeFocus?: (node: NodeObj | null) => void,
    containerId = 'vizly-mind-elixir-root'
): PresentationController {
    const isActiveRef = useRef(false);
    const indexRef = useRef(0);
    const nodeIdsRef = useRef<string[]>([]);
    const onStopRef = useRef(onStop);
    const onNodeFocusRef = useRef(onNodeFocus);

    useEffect(() => { onStopRef.current = onStop; }, [onStop]);
    useEffect(() => { onNodeFocusRef.current = onNodeFocus; }, [onNodeFocus]);

    const getContainer = () => document.getElementById(containerId);

    const navigateTo = useCallback((idx: number, ids: string[], nodeData: NodeObj) => {
        if (!mind) return;
        const id = ids[idx];
        try {
            const tpcEl = mind.findEle(id);
            if (!tpcEl) return;
            mind.selectNode(tpcEl);
            mind.scrollIntoView(tpcEl);

            // find topic text
            const obj = mind.getObjById(id, nodeData);
            showPresentationHUD(obj?.topic ?? id, idx, ids.length);
            onNodeFocusRef.current?.(obj ?? null);
        } catch (e) {
            console.warn('[Presentation] navigate error:', e);
        }
    }, [mind]);

    const stop = useCallback(() => {
        if (!isActiveRef.current) return;
        isActiveRef.current = false;

        const container = getContainer();
        container?.classList.remove('me-presenting');

        // Exit fullscreen
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        removeHUD();
        mind?.clearSelection?.();

        onNodeFocusRef.current?.(null);

        // Notify Toolbar so it can sync its isPresenting state
        onStopRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mind]);

    const start = useCallback(() => {
        if (!mind) return;
        if (isActiveRef.current) { stop(); return; }

        injectPresentationCSS();

        const data = mind.getData();
        const ids = flattenNodesDFS(data.nodeData);
        nodeIdsRef.current = ids;
        indexRef.current = 0;
        isActiveRef.current = true;

        // Enter fullscreen
        const container = getContainer();
        container?.classList.add('me-presenting');
        container?.requestFullscreen?.().catch(() => {});

        // Navigate to first node
        navigateTo(0, ids, data.nodeData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mind, navigateTo, stop]);

    // Keyboard listener
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (!isActiveRef.current) return;
            const ids = nodeIdsRef.current;
            const data = mind?.getData();
            if (!data) return;

            if (e.key === 'Escape') {
                stop();
                return;
            }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                const next = Math.min(indexRef.current + 1, ids.length - 1);
                indexRef.current = next;
                navigateTo(next, ids, data.nodeData);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = Math.max(indexRef.current - 1, 0);
                indexRef.current = prev;
                navigateTo(prev, ids, data.nodeData);
            }
        };

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && isActiveRef.current) {
                stop();
            }
        };

        document.addEventListener('keydown', handleKey, true);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('keydown', handleKey, true);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [mind, navigateTo, stop]);

    return {
        get isActive() { return isActiveRef.current; },
        start,
        stop,
    };
}
