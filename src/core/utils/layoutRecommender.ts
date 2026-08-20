import { Node, Edge } from '@xyflow/react';

/**
 * layoutRecommender — 基于图结构特征智能推荐最优布局策略
 *
 * 分析维度：
 * 1. 域数量与分布（是否需要域级编排）
 * 2. 拓扑结构（线性链/树形/网状/星形）
 * 3. 节点密度与数量
 * 4. 边的密度（稀疏/密集）
 */

export interface LayoutRecommendation {
    /** 推荐的域级策略名称 */
    domainStrategy: string;
    /** 推荐的域内节点排布 */
    nodeLayout: string;
    /** 推荐的方向 */
    direction: 'TB' | 'LR';
    /** 推荐理由 */
    reason: string;
    /** 置信度 0-1 */
    confidence: number;
}

interface GraphMetrics {
    nodeCount: number;
    edgeCount: number;
    domainCount: number;
    maxDegree: number;          // 最大连接度
    avgDegree: number;          // 平均连接度
    isLinearChain: boolean;     // 线性链（每节点 ≤2 连接）
    isTree: boolean;            // 树形（无环 + 单根）
    hasCycles: boolean;         // 有环
    hasDomainCycles: boolean;   // 跨域商图有环
    maxDepth: number;           // 最大深度
    widthToHeightRatio: number; // 宽高比（bounds）
    containerCount: number;     // 容器节点数量
}

const CONTAINER_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane', 'group', 'domain']);

const hasDirectedCycle = (
    nodeIds: Iterable<string>,
    pairs: Iterable<readonly [string, string]>,
): boolean => {
    const ids = new Set(nodeIds);
    const inDegree = new Map<string, number>([...ids].map(id => [id, 0]));
    const adjacency = new Map<string, Set<string>>();
    for (const [source, target] of pairs) {
        if (!ids.has(source) || !ids.has(target)) continue;
        const targets = adjacency.get(source) ?? new Set<string>();
        if (targets.has(target)) continue;
        targets.add(target);
        adjacency.set(source, targets);
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }

    const queue = [...ids].filter(id => (inDegree.get(id) ?? 0) === 0);
    let visited = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const id = queue[cursor];
        if (!id) continue;
        visited += 1;
        for (const target of adjacency.get(id) ?? []) {
            const nextDegree = (inDegree.get(target) ?? 0) - 1;
            inDegree.set(target, nextDegree);
            if (nextDegree === 0) queue.push(target);
        }
    }
    return visited < ids.size;
};

function analyzeGraph(nodes: Node[], edges: Edge[]): GraphMetrics {
    const normalNodes = nodes.filter(n => !CONTAINER_TYPES.has(n.type || ''));
    const containers = nodes.filter(n => CONTAINER_TYPES.has(n.type || ''));

    // 域统计
    const domains = new Set<string>();
    normalNodes.forEach(n => {
        const domain = n.data?.domain;
        if (typeof domain === 'string' && domain) domains.add(domain);
    });

    // 度数统计
    const degree = new Map<string, number>();
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    normalNodes.forEach(n => {
        degree.set(n.id, 0);
        inDegree.set(n.id, 0);
        outDegree.set(n.id, 0);
    });

    edges.forEach(e => {
        degree.set(e.source, (degree.get(e.source) || 0) + 1);
        degree.set(e.target, (degree.get(e.target) || 0) + 1);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
    });

    const degrees = [...degree.values()];
    const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;
    const avgDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;

    // 线性链检测
    const isLinearChain = normalNodes.length > 1 &&
        normalNodes.every(node => (
            (inDegree.get(node.id) ?? 0) <= 1
            && (outDegree.get(node.id) ?? 0) <= 1
        )) &&
        edges.length === normalNodes.length - 1;

    const normalNodeIds = new Set(normalNodes.map(node => node.id));
    const normalPairs = edges
        .filter(edge => normalNodeIds.has(edge.source) && normalNodeIds.has(edge.target))
        .map(edge => [edge.source, edge.target] as const);
    const hasCycles = hasDirectedCycle(normalNodeIds, normalPairs);
    const domainByNodeId = new Map(normalNodes.map(node => [
        node.id,
        typeof node.data?.domain === 'string' ? node.data.domain.trim() : '',
    ] as const));
    const domainPairs = normalPairs.flatMap(([source, target]) => {
        const sourceDomain = domainByNodeId.get(source);
        const targetDomain = domainByNodeId.get(target);
        return sourceDomain && targetDomain && sourceDomain !== targetDomain
            ? [[sourceDomain, targetDomain] as const]
            : [];
    });
    const hasDomainCycles = hasDirectedCycle(domains, domainPairs);

    // 树形检测
    const roots = normalNodes.filter(n => (inDegree.get(n.id) || 0) === 0);
    const isTree = !hasCycles && roots.length === 1 && edges.length === normalNodes.length - 1;

    // 最大深度（BFS from roots）
    let maxDepth = 0;
    if (roots.length > 0) {
        const adj = new Map<string, string[]>();
        edges.forEach(e => {
            if (!adj.has(e.source)) adj.set(e.source, []);
            adj.get(e.source)!.push(e.target);
        });
        const visited = new Set<string>();
        const queue: [string, number][] = roots.map(r => [r.id, 0]);
        while (queue.length > 0) {
            const [id, depth] = queue.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);
            maxDepth = Math.max(maxDepth, depth);
            (adj.get(id) || []).forEach(child => {
                if (!visited.has(child)) queue.push([child, depth + 1]);
            });
        }
    }

    // 宽高比
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    normalNodes.forEach(n => {
        minX = Math.min(minX, n.position.x);
        maxX = Math.max(maxX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxY = Math.max(maxY, n.position.y);
    });
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;

    return {
        nodeCount: normalNodes.length,
        edgeCount: edges.length,
        domainCount: domains.size,
        maxDegree,
        avgDegree,
        isLinearChain,
        isTree,
        hasCycles,
        hasDomainCycles,
        maxDepth,
        widthToHeightRatio: w / h,
        containerCount: containers.length,
    };
}

export function recommendLayout(nodes: Node[], edges: Edge[]): LayoutRecommendation {
    const m = analyzeGraph(nodes, edges);

    // ─── 规则 1：多域 → 优先保留语义容器 ─────────────
    if (m.domainCount >= 2) {
        if (m.hasDomainCycles || m.hasCycles) {
            return {
                domainStrategy: 'domain-lanes',
                nodeLayout: 'dagre',
                direction: 'LR',
                reason: `${m.domainCount} 个域且存在反馈环，循环流程泳道可避免分层布局反复回退`,
                confidence: 0.92,
            };
        }
        if (m.containerCount > m.domainCount || m.edgeCount > m.nodeCount) {
            return {
                domainStrategy: 'domain-compound-elk',
                nodeLayout: 'dagre',
                direction: 'LR',
                reason: `${m.domainCount} 个域且包含复合层级，复杂流程布局可减少失败回退`,
                confidence: 0.88,
            };
        }
        if (m.isTree || m.maxDepth > 3) {
            return {
                domainStrategy: 'domain-dagre',
                nodeLayout: 'dagre',
                direction: m.widthToHeightRatio > 1.5 ? 'LR' : 'TB',
                reason: `${m.domainCount} 个域且层级清晰，标准流程布局可保留域结构`,
                confidence: 0.85,
            };
        }
        if (m.avgDegree > 3) {
            return {
                domainStrategy: 'domain-compound-elk',
                nodeLayout: 'dagre',
                direction: 'LR',
                reason: `${m.domainCount} 个域且连接密集，复杂流程布局更适合跨域正交连线`,
                confidence: 0.82,
            };
        }
        return {
            domainStrategy: 'domain-dagre',
            nodeLayout: 'dagre',
            direction: 'TB',
            reason: `${m.domainCount} 个域，使用保留域的标准流程布局`,
            confidence: 0.8,
        };
    }

    // ─── 规则 2：线性链 → 水平/垂直 ─────────────────
    if (m.isLinearChain) {
        return {
            domainStrategy: 'tree',
            nodeLayout: 'horizontal',
            direction: m.nodeCount > 8 ? 'LR' : 'TB',
            reason: `线性链（${m.nodeCount} 节点），${m.nodeCount > 8 ? '横向' : '纵向'}排列`,
            confidence: 0.9,
        };
    }

    // ─── 规则 3：纯树形 → Dagre ─────────────────────
    if (m.isTree) {
        return {
            domainStrategy: 'tree',
            nodeLayout: 'flow',
            direction: m.maxDepth > m.nodeCount / 3 ? 'TB' : 'LR',
            reason: `树形结构（深度 ${m.maxDepth}），Dagre 自动分层`,
            confidence: 0.88,
        };
    }

    // ─── 规则 4：高度连接（网状）→ ELK ──────────────
    if (m.avgDegree > 3 || m.hasCycles) {
        return {
            domainStrategy: 'domain-elk',
            nodeLayout: 'dagre',
            direction: 'TB',
            reason: `网状拓扑（平均度 ${m.avgDegree.toFixed(1)}），ELK 力导向+约束布局`,
            confidence: 0.75,
        };
    }

    // ─── 规则 5：少量节点（≤10）→ Centered ──────────
    if (m.nodeCount <= 10 && m.edgeCount <= 15) {
        return {
            domainStrategy: 'tree',
            nodeLayout: 'flow',
            direction: 'TB',
            reason: `小型图（${m.nodeCount} 节点），居中布局视觉最佳`,
            confidence: 0.7,
        };
    }

    // ─── 规则 6：大型图（≥50）→ Dagre + Grid ────────
    if (m.nodeCount >= 50) {
        return {
            domainStrategy: 'domain-elk',
            nodeLayout: 'elk-layered',
            direction: 'TB',
            reason: `大型图（${m.nodeCount} 节点），Dagre 分层 + 网格排布`,
            confidence: 0.7,
        };
    }

    // ─── 默认 → Dagre TB ────────────────────────────
    return {
        domainStrategy: 'domain-dagre',
        nodeLayout: 'dagre',
        direction: 'TB',
        reason: `通用图结构（${m.nodeCount} 节点, ${m.edgeCount} 边），Dagre 分层布局`,
        confidence: 0.65,
    };
}
