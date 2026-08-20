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
import {
    logMindmapPresentationFullscreenFailure,
    logMindmapPresentationNavigateFailure,
} from './mindmapPanelLogging';
import { isolatePresentationAccessibility } from './presentationAccessibilityIsolation';

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

export interface PresentationHudLabels {
    toolbar: string;
    previous: string;
    next: string;
    exit: string;
}

interface PresentationHudActions {
    onPrevious: () => void;
    onNext: () => void;
    onExit: () => void;
}

type PresentationHudAction = 'previous' | 'next' | 'exit';

export interface PresentationModeOptions {
    containerId?: string;
    labels?: Partial<PresentationHudLabels>;
    returnFocusTarget?: () => HTMLElement | null;
}

const DEFAULT_HUD_LABELS: PresentationHudLabels = {
    toolbar: 'Presentation mode',
    previous: 'Previous',
    next: 'Next',
    exit: 'Exit',
};

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
        .me-presenting {
            position: fixed !important;
            inset: 0 !important;
            width: 100dvw !important;
            height: 100dvh !important;
            overflow: hidden !important;
        }
        /* 演示模式 HUD */
        #me-presentation-hud {
            position: fixed;
            bottom: max(20px, env(safe-area-inset-bottom));
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            box-sizing: border-box;
            width: max-content;
            max-width: calc(100dvw - 24px);
            background: rgba(15,15,20,0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            padding: 8px 10px;
            display: grid;
            grid-template-columns: auto minmax(80px, 1fr) auto;
            align-items: center;
            gap: 10px;
            color: #fff;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
            user-select: none;
            outline: none;
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
        #me-presentation-hud .hud-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        #me-presentation-hud .hud-action {
            min-width: 44px;
            min-height: 44px;
            padding: 0 10px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 9px;
            color: #fff;
            cursor: pointer;
            font: inherit;
            font-size: 12px;
            font-weight: 600;
        }
        #me-presentation-hud .hud-action:hover:not(:disabled) {
            background: rgba(255,255,255,0.18);
        }
        #me-presentation-hud .hud-action:focus-visible,
        #me-presentation-hud:focus-visible {
            outline: 2px solid #a5b4fc;
            outline-offset: 2px;
        }
        #me-presentation-hud .hud-action:disabled {
            opacity: 0.38;
            cursor: not-allowed;
        }
        @media (max-width: 600px) {
            #me-presentation-hud {
                bottom: max(10px, env(safe-area-inset-bottom));
                width: calc(100dvw - 24px);
                grid-template-columns: auto minmax(0, 1fr);
                gap: 6px 10px;
                border-radius: 14px;
            }
            #me-presentation-hud .hud-topic {
                max-width: none;
            }
            #me-presentation-hud .hud-actions {
                grid-column: 1 / -1;
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }
            #me-presentation-hud .hud-action {
                min-width: 0;
                padding: 0 6px;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            .me-presenting .map-container me-tpc,
            .me-presenting .map-container me-tpc.selected {
                transition: none !important;
            }
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

const createHudButton = (
    action: PresentationHudAction,
    label: string,
    onClick: () => void,
    disabled = false,
): HTMLButtonElement => {
    const button = document.createElement('button');
    button.className = 'hud-action';
    button.dataset.presentationAction = action;
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
};

const restoreHudActionFocus = (preferredAction: PresentationHudAction): void => {
    requestAnimationFrame(() => {
        const hud = document.getElementById('me-presentation-hud');
        const preferred = hud?.querySelector<HTMLButtonElement>(
            `[data-presentation-action="${preferredAction}"]:not(:disabled)`,
        );
        const exit = hud?.querySelector<HTMLButtonElement>(
            '[data-presentation-action="exit"]:not(:disabled)',
        );
        (preferred ?? exit)?.focus({ preventScroll: true });
    });
};

export function showPresentationHUD(
    topic: string,
    index: number,
    total: number,
    host: HTMLElement | null = document.body,
    actions?: PresentationHudActions,
    labels: PresentationHudLabels = DEFAULT_HUD_LABELS,
): HTMLElement {
    let hud = document.getElementById('me-presentation-hud');
    if (!hud) {
        hud = document.createElement('div');
        hud.id = 'me-presentation-hud';
    }

    hud.setAttribute('role', 'toolbar');
    hud.setAttribute('aria-label', labels.toolbar);
    hud.tabIndex = -1;

    // Fullscreen only renders descendants of the fullscreen element. Keep the
    // navigation HUD inside the mind-map root so it remains visible after the
    // browser enters presentation mode.
    (host ?? document.body).appendChild(hud);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'hud-actions';
    if (actions) {
        actionGroup.append(
            createHudButton('previous', labels.previous, actions.onPrevious, index <= 0),
            createHudButton('next', labels.next, actions.onNext, index >= total - 1),
            createHudButton('exit', labels.exit, actions.onExit),
        );
    }

    const topicNode = createHudSpan('hud-topic', topic);
    topicNode.setAttribute('aria-live', 'polite');

    hud.replaceChildren(
        createHudSpan('hud-counter', `${index + 1} / ${total}`),
        topicNode,
        actionGroup,
    );
    return hud;
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
    options: PresentationModeOptions = {},
): PresentationController {
    const containerId = options.containerId ?? 'vizly-mind-elixir-root';
    const isActiveRef = useRef(false);
    const indexRef = useRef(0);
    const nodeIdsRef = useRef<string[]>([]);
    const onStopRef = useRef(onStop);
    const onNodeFocusRef = useRef(onNodeFocus);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const restoreAccessibilityRef = useRef<() => void>(() => undefined);
    const stopRef = useRef<() => void>(() => undefined);
    const labelsRef = useRef<PresentationHudLabels>({
        ...DEFAULT_HUD_LABELS,
        ...options.labels,
    });
    const configuredReturnFocusRef = useRef(options.returnFocusTarget);

    useEffect(() => { onStopRef.current = onStop; }, [onStop]);
    useEffect(() => { onNodeFocusRef.current = onNodeFocus; }, [onNodeFocus]);
    useEffect(() => {
        labelsRef.current = { ...DEFAULT_HUD_LABELS, ...options.labels };
    }, [options.labels]);
    useEffect(() => {
        configuredReturnFocusRef.current = options.returnFocusTarget;
    }, [options.returnFocusTarget]);

    const getContainer = () => document.getElementById(containerId);

    const navigateTo = useCallback(function navigateToNode(idx: number, ids: string[], nodeData: NodeObj) {
        if (!mind) return;
        const id = ids[idx];
        try {
            const tpcEl = mind.findEle(id);
            if (!tpcEl) return;
            mind.selectNode(tpcEl);
            mind.scrollIntoView(tpcEl);

            // find topic text
            const obj = mind.getObjById(id, nodeData);
            showPresentationHUD(
                obj?.topic ?? id,
                idx,
                ids.length,
                document.getElementById(containerId),
                {
                    onPrevious: () => {
                        const previous = Math.max(indexRef.current - 1, 0);
                        indexRef.current = previous;
                        navigateToNode(previous, ids, nodeData);
                        restoreHudActionFocus('previous');
                    },
                    onNext: () => {
                        const next = Math.min(indexRef.current + 1, ids.length - 1);
                        indexRef.current = next;
                        navigateToNode(next, ids, nodeData);
                        restoreHudActionFocus('next');
                    },
                    onExit: () => stopRef.current(),
                },
                labelsRef.current,
            );
            onNodeFocusRef.current?.(obj ?? null);
        } catch (e) {
            logMindmapPresentationNavigateFailure(e);
        }
    }, [containerId, mind]);

    const stop = useCallback(() => {
        if (!isActiveRef.current) return;
        isActiveRef.current = false;

        const container = getContainer();
        container?.classList.remove('me-presenting');
        restoreAccessibilityRef.current();
        restoreAccessibilityRef.current = () => undefined;

        // Exit fullscreen
        if (document.fullscreenElement) {
            document.exitFullscreen().catch((error) => {
                logMindmapPresentationFullscreenFailure('exit', error);
            });
        }

        removeHUD();
        mind?.clearSelection?.();

        onNodeFocusRef.current?.(null);

        // Notify Toolbar so it can sync its isPresenting state
        onStopRef.current?.();

        const returnTarget = returnFocusRef.current ?? configuredReturnFocusRef.current?.() ?? null;
        returnFocusRef.current = null;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
            });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mind]);

    useEffect(() => {
        stopRef.current = stop;
    }, [stop]);

    const start = useCallback(() => {
        if (!mind) return;
        if (isActiveRef.current) { stop(); return; }

        injectPresentationCSS();

        const data = mind.getData();
        const ids = flattenNodesDFS(data.nodeData);
        if (ids.length === 0) return;
        nodeIdsRef.current = ids;
        indexRef.current = 0;
        isActiveRef.current = true;
        returnFocusRef.current = configuredReturnFocusRef.current?.()
            ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

        // Enter fullscreen
        const container = getContainer();
        container?.classList.add('me-presenting');
        container?.requestFullscreen?.().catch((error) => {
            logMindmapPresentationFullscreenFailure('enter', error);
        });

        // Navigate to first node
        navigateTo(0, ids, data.nodeData);
        restoreAccessibilityRef.current();
        restoreAccessibilityRef.current = isolatePresentationAccessibility(container);
        requestAnimationFrame(() => document.getElementById('me-presentation-hud')?.focus({ preventScroll: true }));
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
                e.preventDefault();
                stop();
                return;
            }
            const target = e.target instanceof HTMLElement ? e.target : null;
            const isInteractiveTarget = Boolean(target?.closest('button, a, input, select, textarea, [role="button"]'));
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (!isInteractiveTarget && (e.key === ' ' || e.key === 'Enter'))) {
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

    useEffect(() => () => {
        restoreAccessibilityRef.current();
        restoreAccessibilityRef.current = () => undefined;
    }, []);

    return {
        get isActive() { return isActiveRef.current; },
        start,
        stop,
    };
}
