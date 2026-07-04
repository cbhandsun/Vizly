import { Node } from '@xyflow/react';
import { safeLog } from './consoleCleanup';

/**
 * 缓动函数：ease-out cubic
 * 开始快、结束慢，符合自然物理运动感
 */
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * 大图保护阈值：超过此节点数时跳过动画，直接跳变
 */
const ANIMATION_NODE_THRESHOLD = 200;

/**
 * 默认动画时长 (ms)
 */
const DEFAULT_DURATION = 300;
const activeAnimations = new WeakMap<React.Dispatch<React.SetStateAction<Node[]>>, () => void>();
const suspendedUntil = new WeakMap<React.Dispatch<React.SetStateAction<Node[]>>, number>();

interface AnimationTarget {
    from: { x: number; y: number };
    to: { x: number; y: number };
}

export function cancelLayoutTransition(setNodes: React.Dispatch<React.SetStateAction<Node[]>>) {
    const cancel = activeAnimations.get(setNodes);
    if (cancel) {
        cancel();
        activeAnimations.delete(setNodes);
    }
}

export function suspendLayoutTransitions(
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    duration = 1200
) {
    cancelLayoutTransition(setNodes);
    const until = Date.now() + duration;
    suspendedUntil.set(setNodes, Math.max(suspendedUntil.get(setNodes) ?? 0, until));
}

/**
 * 布局过渡动画：从当前位置平滑插值到目标位置
 *
 * @param setNodes    - React Flow 的 setNodes（支持 updater 函数模式）
 * @param targetNodes - 布局计算后的目标节点（含最终 position）
 * @param options     - 可选配置
 * @returns Promise   - 动画结束后 resolve
 *
 * 核心机制：
 * 1. 从 setNodes 回调读取每个节点的当前位置（避免 stale state）
 * 2. 构建 id→{from, to} 映射
 * 3. RAF 循环中按 easing 插值更新 position
 * 4. 结束后精确设置目标位置
 *
 * 性能保障：
 * - 节点数 > ANIMATION_NODE_THRESHOLD 时直接跳变
 * - 动画帧只改 position，不触碰 data/style/className
 * - 不在 targetNodes 中的节点保持不动
 */
export function animateLayoutTransition(
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    targetNodes: Node[],
    options?: {
        duration?: number;
        easing?: (t: number) => number;
        onComplete?: () => void;
    }
): Promise<void> {
    const duration = options?.duration ?? DEFAULT_DURATION;
    const easing = options?.easing ?? easeOutCubic;
    cancelLayoutTransition(setNodes);

    if ((suspendedUntil.get(setNodes) ?? 0) > Date.now()) {
        options?.onComplete?.();
        return Promise.resolve();
    }

    // 大图保护：超过阈值直接跳变
    if (targetNodes.length > ANIMATION_NODE_THRESHOLD) {
        setNodes(targetNodes);
        options?.onComplete?.();
        return Promise.resolve();
    }

    // 构建目标位置映射
    const targetMap = new Map<string, { x: number; y: number }>();
    const targetNodeMap = new Map<string, Node>();
    for (const node of targetNodes) {
        if (!node.position) {
            safeLog.warn(`[animateLayoutTransition] Target node ${node.id} is missing position, falling back.`);
            node.position = { x: 0, y: 0 };
        }
        targetMap.set(node.id, { x: node.position.x, y: node.position.y });
        targetNodeMap.set(node.id, node);
    }

    return new Promise<void>((resolve) => {
        let animationMap: Map<string, AnimationTarget> | null = null;
        let startTime: number | null = null;
        let rafId: number | null = null;
        let cancelled = false;

        activeAnimations.set(setNodes, () => {
            cancelled = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
            options?.onComplete?.();
            resolve();
        });

        // 第一步：捕获当前位置（通过 setNodes updater 读取最新 state）
        setNodes(currentNodes => {
            if (cancelled) return currentNodes;
            animationMap = new Map<string, AnimationTarget>();

            for (const node of currentNodes) {
                const target = targetMap.get(node.id);
                if (target) {
                    // 只对位置有变化的节点设置动画
                    const dx = Math.abs(node.position.x - target.x);
                    const dy = Math.abs(node.position.y - target.y);
                    if (dx > 0.5 || dy > 0.5) {
                        animationMap.set(node.id, {
                            from: { x: node.position.x, y: node.position.y },
                            to: target,
                        });
                    }
                }
            }

            // 如果没有节点需要动画，直接返回目标状态
            if (animationMap.size === 0) {
                setTimeout(() => {
                    if (cancelled) return;
                    activeAnimations.delete(setNodes);
                    setNodes(targetNodes);
                    options?.onComplete?.();
                    resolve();
                }, 0);
                return currentNodes; // 不改变当前帧
            }

            // 启动动画循环
            startTime = performance.now();
            rafId = requestAnimationFrame(tick);

            return currentNodes; // 不改变当前帧，由 tick 驱动
        });

        function tick(now: number) {
            if (cancelled || !animationMap || !startTime) return;

            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easing(progress);

            if (progress >= 1) {
                // 动画结束：精确设置最终位置（使用完整的 targetNodes 替换）
                activeAnimations.delete(setNodes);
                setNodes(targetNodes);
                options?.onComplete?.();
                resolve();
                return;
            }

            // 插值更新
            setNodes(currentNodes => {
                if (cancelled) return currentNodes;
                return currentNodes.map(node => {
                    const anim = animationMap!.get(node.id);
                    if (!anim) {
                        // 非动画节点：如果是新增节点（在 target 中但不在 current 中），跳过
                        // 如果是 target 中有但不需要动画的节点，更新为目标状态
                        const targetNode = targetNodeMap.get(node.id);
                        if (targetNode && targetNode !== node) {
                            return { ...targetNode, position: targetNode.position || node.position || { x: 0, y: 0 } };
                        }
                        return node;
                    }

                    const x = anim.from.x + (anim.to.x - anim.from.x) * easedProgress;
                    const y = anim.from.y + (anim.to.y - anim.from.y) * easedProgress;

                    return {
                        ...node,
                        position: { x, y },
                    };
                });
            });

            rafId = requestAnimationFrame(tick);
        }
    });
}
