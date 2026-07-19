/**
 * LayoutAlgorithms — 轻量级自动布局算法集
 *
 * 从 DiagramView-SVG AutoLayoutPlugin 移植 + 适配 React Flow 数据结构。
 * 不依赖 ELK 等外部布局引擎，适合作为备选/快速布局方案。
 *
 * 包含：
 * 1. treeLayout       — 层次树形布局 (TB / LR)
 * 2. forceDirectedLayout — 力导向布局 (spring-force 迭代)
 */

import type { Node, Edge } from '@xyflow/react';

export {
    applyLayout,
    calculateSubtreeBounds,
    calculateSummaryGeometry,
    forceDirectedLayout,
} from './layout/forceLayoutGeometry';
export type { ForceLayoutOptions } from './layout/forceLayoutGeometry';

export type LayoutDirection = 'TB' | 'LR';

export interface LayoutOptions {
    /** 布局方向（仅树形布局使用） */
    direction?: LayoutDirection;
    /** 同层节点间距 */
    nodeSpacing?: number;
    /** 层间距离 */
    levelSpacing?: number;
}

type Point = { x: number; y: number };

// ─────────────── 树形布局 ───────────────

interface TreeNode {
    id: string;
    children: TreeNode[];
    width: number;
    height: number;
    x: number;
    y: number;
    subtreeWidth: number;
}

/**
 * 层次树形布局（Reingold-Tilford 简化版）
 *
 * 算法：
 * 1. 构建有向图，找到根节点（无入边的节点）
 * 2. 递归计算子树宽度
 * 3. 自顶向下分配坐标，每棵子树居中对齐
 * 4. 孤立节点排列在底部
 *
 * @returns 每个节点的新位置
 */
export function treeLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {},
): Map<string, Point> {
    const direction = options.direction || 'TB';
    const nodeSpacing = options.nodeSpacing || 40;
    const levelSpacing = options.levelSpacing || 80;

    const positions = new Map<string, Point>();
    if (nodes.length === 0) return positions;

    // 获取节点尺寸
    const getSize = (n: Node) => ({
        width: n.measured?.width ?? (n as any).width ?? 150,
        height: n.measured?.height ?? (n as any).height ?? 50,
    });

    // 建立邻接表
    const childrenMap = new Map<string, string[]>();
    const parentSet = new Set<string>();
    const nodeMap = new Map<string, Node>();

    const realEdges = edges.filter(e => e.type !== 'relationshipEdge');

    for (const n of nodes) nodeMap.set(n.id, n);

    for (const e of realEdges) {
        if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
        childrenMap.get(e.source)!.push(e.target);
        parentSet.add(e.target);
    }

    // 根节点：无入边的节点
    const roots = nodes.filter(n => !parentSet.has(n.id));
    if (roots.length === 0 && nodes.length > 0) {
        roots.push(nodes[0]);
    }

    // 构建树
    const visited = new Set<string>();

    function buildTree(id: string): TreeNode {
        visited.add(id);
        const node = nodeMap.get(id);
        const { width: w, height: h } = node ? getSize(node) : { width: 150, height: 50 };
        const childIds = (childrenMap.get(id) || []).filter(cid => !visited.has(cid));
        const children = childIds.map(cid => buildTree(cid));
        const subtreeWidth = children.length > 0
            ? children.reduce((sum, c) => sum + c.subtreeWidth, 0) + (children.length - 1) * nodeSpacing
            : (direction === 'TB' ? w : h);
        return { id, children, width: w, height: h, x: 0, y: 0, subtreeWidth };
    }

    const trees = roots.map(r => buildTree(r.id));

    // 布局
    function layout(tree: TreeNode, x: number, y: number): void {
        if (direction === 'TB') {
            tree.x = x + (tree.subtreeWidth - tree.width) / 2;
            tree.y = y;
            let childX = x;
            for (const child of tree.children) {
                layout(child, childX, y + tree.height + levelSpacing);
                childX += child.subtreeWidth + nodeSpacing;
            }
        } else {
            // LR
            tree.x = x;
            tree.y = y + (tree.subtreeWidth - tree.height) / 2;
            let childY = y;
            for (const child of tree.children) {
                layout(child, x + tree.width + levelSpacing, childY);
                childY += child.subtreeWidth + nodeSpacing;
            }
        }
        positions.set(tree.id, { x: tree.x, y: tree.y });
    }

    let offset = 0;
    for (const tree of trees) {
        if (direction === 'TB') {
            layout(tree, offset + 100, 100);
            offset += tree.subtreeWidth + nodeSpacing * 2;
        } else {
            layout(tree, 100, offset + 100);
            offset += tree.subtreeWidth + nodeSpacing * 2;
        }
    }

    // 孤立节点排列在底部/右侧
    let orphanOffset = 100;
    const maxVal = Math.max(...Array.from(positions.values()).map(p => direction === 'TB' ? p.y : p.x), 0);
    for (const n of nodes) {
        if (!positions.has(n.id)) {
            const { width: w, height: h } = getSize(n);
            if (direction === 'TB') {
                positions.set(n.id, { x: orphanOffset, y: maxVal + levelSpacing * 2 });
                orphanOffset += w + nodeSpacing;
            } else {
                positions.set(n.id, { x: maxVal + levelSpacing * 2, y: orphanOffset });
                orphanOffset += h + nodeSpacing;
            }
        }
    }

    return positions;
}

// ─────────────── 对称平衡发散布局 (Symmetric Mind Map Layout) ───────────────

/**
 * 专业思维导图布局算法
 * 将根节点居中，其直接子代均匀切分到左右两边，形成经典的左右发散脑图形态。
 */
export function symmetricMindMapLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {},
    externalMaps?: { nodeMap?: Map<string, Node>, childrenMap?: Map<string, string[]> }
): Map<string, Point> {
    const nodeSpacing = options.nodeSpacing ?? 40;
    const levelSpacing = options.levelSpacing ?? 100;

    const positions = new Map<string, Point>();
    if (nodes.length === 0) return positions;

    const getSize = (n: Node) => ({
        width: n.measured?.width ?? (n as any).width ?? 150,
        height: n.measured?.height ?? (n as any).height ?? 50,
    });

    const nodeMap = externalMaps?.nodeMap || new Map<string, Node>();
    if (!externalMaps?.nodeMap) {
        for (const n of nodes) nodeMap.set(n.id, n);
    }

    const childrenMap = externalMaps?.childrenMap || new Map<string, string[]>();
    const parentSet = new Set<string>();
    
    if (!externalMaps?.childrenMap) {
        const summaryNodeIds = new Set(nodes.filter(n => n.data?.isSummary).map(n => n.id));
        const realEdges = edges.filter(e => e.type !== 'relationshipEdge' && !summaryNodeIds.has(e.target));
        
        for (const e of realEdges) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
            parentSet.add(e.target);
        }
    } else {
        // Build parentSet from childrenMap if not provided
        for (const [, kids] of childrenMap.entries()) {
            for (const kid of kids) parentSet.add(kid);
        }
    }

    const roots = nodes.filter(n => !parentSet.has(n.id));
    if (roots.length === 0 && nodes.length > 0) {
        roots.push(nodes[0]);
    }

    const visited = new Set<string>();

    function buildTree(id: string): TreeNode {
        visited.add(id);
        const node = nodeMap.get(id);
        const { width: w, height: h } = node ? getSize(node) : { width: 150, height: 50 };
        const childIds = (childrenMap.get(id) || []).filter(cid => !visited.has(cid));
        const children = childIds.map(cid => buildTree(cid));
        // Note: For LR/RL layouts, "subtreeWidth" is technically the height dimension
        const subtreeWidth = children.length > 0
            ? children.reduce((sum, c) => sum + c.subtreeWidth, 0) + (children.length - 1) * nodeSpacing
            : h;
        return { id, children, width: w, height: h, x: 0, y: 0, subtreeWidth };
    }

    function layoutSubtree(tree: TreeNode, xRaw: number, y: number, isRight: boolean): void {
        tree.y = y + (tree.subtreeWidth - tree.height) / 2;
        // If isRight, xRaw is the left start. If !isRight, xRaw is the right end, so subtract width.
        tree.x = isRight ? xRaw : xRaw - tree.width;
        
        let childY = y;
        for (const child of tree.children) {
            if (isRight) {
                layoutSubtree(child, tree.x + tree.width + levelSpacing, childY, true);
            } else {
                layoutSubtree(child, tree.x - levelSpacing, childY, false);
            }
            childY += child.subtreeWidth + nodeSpacing;
        }
        positions.set(tree.id, { x: tree.x, y: tree.y });
    }

    let rootYOffset = 100;

    for (const root of roots) {
        visited.add(root.id);
        const rNode = nodeMap.get(root.id);
        const { width: rw, height: rh } = rNode ? getSize(rNode) : { width: 150, height: 50 };
        
        const childIds = (childrenMap.get(root.id) || []).filter(cid => !visited.has(cid));
        
        const leftChildren: TreeNode[] = [];
        const rightChildren: TreeNode[] = [];
        
        childIds.forEach((cid, idx) => {
            const childTree = buildTree(cid);
            // Even indexes to the right, odd to the left to maintain mechanical balance
            if (idx % 2 === 0) rightChildren.push(childTree);
            else leftChildren.push(childTree);
        });

        const leftTotalHeight = leftChildren.reduce((s, c) => s + c.subtreeWidth, 0) + Math.max(0, leftChildren.length - 1) * nodeSpacing;
        const rightTotalHeight = rightChildren.reduce((s, c) => s + c.subtreeWidth, 0) + Math.max(0, rightChildren.length - 1) * nodeSpacing;
        const totalHeight = Math.max(rh, leftTotalHeight, rightTotalHeight);

        // Preserve existing root coordinate so the map doesn't jump
        const rootX = rNode?.position?.x ?? 500; 
        const rootY = rNode?.position?.y ?? (rootYOffset + (totalHeight - rh) / 2);
        positions.set(root.id, { x: rootX, y: rootY });

        const rootCenterY = rootY + rh / 2;

        // Lay out right side (centered against root)
        let rightStartY = rootCenterY - rightTotalHeight / 2;
        for (const child of rightChildren) {
            layoutSubtree(child, rootX + rw + levelSpacing, rightStartY, true);
            rightStartY += child.subtreeWidth + nodeSpacing;
        }

        // Lay out left side (centered against root)
        let leftStartY = rootCenterY - leftTotalHeight / 2;
        for (const child of leftChildren) {
            layoutSubtree(child, rootX - levelSpacing, leftStartY, false);
            leftStartY += child.subtreeWidth + nodeSpacing;
        }

        rootYOffset += totalHeight + levelSpacing * 2;
    }

    // Basic layout for remaining orphans
    let orphanOffsetX = 100;
    const maxY = Math.max(...Array.from(positions.values()).map(p => p.y)) + levelSpacing * 2 || rootYOffset;
    for (const n of nodes) {
        if (!positions.has(n.id)) {
            positions.set(n.id, { x: orphanOffsetX, y: maxY });
            orphanOffsetX += (getSize(n).width + nodeSpacing);
        }
    }

    return positions;
}

// ─────────────── 单向逻辑图布局 (Directional Logic Chart Layout) ───────────────

/**
 * 右向/左向逻辑图算法
 * 所有子节点都在指定的一侧（右或左）排布。
 */
export function directionalMindMapLayout(
    nodes: Node[],
    edges: Edge[],
    direction: 'L' | 'R',
    options: LayoutOptions = {},
    externalMaps?: { nodeMap?: Map<string, Node>, childrenMap?: Map<string, string[]> }
): Map<string, Point> {
    const nodeSpacing = options.nodeSpacing ?? 30;
    const levelSpacing = options.levelSpacing ?? 100;

    const positions = new Map<string, Point>();
    if (nodes.length === 0) return positions;

    const getSize = (n: Node) => ({
        width: n.measured?.width ?? (n as any).width ?? 150,
        height: n.measured?.height ?? (n as any).height ?? 50,
    });

    const nodeMap = externalMaps?.nodeMap || new Map<string, Node>();
    if (!externalMaps?.nodeMap) {
        for (const n of nodes) nodeMap.set(n.id, n);
    }

    const childrenMap = externalMaps?.childrenMap || new Map<string, string[]>();
    const parentSet = new Set<string>();
    
    if (!externalMaps?.childrenMap) {
        const summaryNodeIds = new Set(nodes.filter(n => n.data?.isSummary).map(n => n.id));
        const realEdges = edges.filter(e => e.type !== 'relationshipEdge' && !summaryNodeIds.has(e.target));
        
        for (const e of realEdges) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
            parentSet.add(e.target);
        }
    } else {
        for (const [, kids] of childrenMap.entries()) {
            for (const kid of kids) parentSet.add(kid);
        }
    }

    const roots = nodes.filter(n => !parentSet.has(n.id));
    if (roots.length === 0 && nodes.length > 0) {
        roots.push(nodes[0]);
    }

    const visited = new Set<string>();

    interface TreeNode {
        id: string;
        children: TreeNode[];
        width: number;
        height: number;
        x: number;
        y: number;
        subtreeHeight: number;
    }

    function buildTree(id: string): TreeNode {
        visited.add(id);
        const node = nodeMap.get(id);
        const { width: w, height: h } = node ? getSize(node) : { width: 150, height: 50 };
        const childIds = (childrenMap.get(id) || []).filter(cid => !visited.has(cid));
        const children = childIds.map(cid => buildTree(cid));
        
        const subtreeHeight = children.length > 0
            ? children.reduce((sum, c) => sum + c.subtreeHeight, 0) + (children.length - 1) * nodeSpacing
            : h;
        return { id, children, width: w, height: h, x: 0, y: 0, subtreeHeight };
    }

    function layoutSubtree(tree: TreeNode, xRaw: number, y: number): void {
        tree.x = direction === 'R' ? xRaw : xRaw - tree.width;
        tree.y = y + (tree.subtreeHeight - tree.height) / 2;
        
        let childY = y;
        for (const child of tree.children) {
            const nextX = direction === 'R' 
                ? tree.x + tree.width + levelSpacing 
                : tree.x - levelSpacing;
            
            layoutSubtree(child, nextX, childY);
            childY += child.subtreeHeight + nodeSpacing;
        }
        positions.set(tree.id, { x: tree.x, y: tree.y });
    }

    let rootYOffset = 100;

    for (const root of roots) {
        const tree = buildTree(root.id);
        
        const rootX = nodeMap.get(root.id)?.position?.x ?? 500; 
        const rootY = nodeMap.get(root.id)?.position?.y ?? (rootYOffset + (tree.subtreeHeight - tree.height) / 2);
        
        tree.x = rootX;
        tree.y = rootY;
        positions.set(tree.id, { x: tree.x, y: tree.y });

        const childrenHeightSum = tree.children.reduce((s, c) => s + c.subtreeHeight, 0) + Math.max(0, tree.children.length - 1) * nodeSpacing;
        let childY = rootY + tree.height / 2 - childrenHeightSum / 2;

        for (const child of tree.children) {
            const nextX = direction === 'R' 
                ? tree.x + tree.width + levelSpacing 
                : tree.x - levelSpacing;
            layoutSubtree(child, nextX, childY);
            childY += child.subtreeHeight + nodeSpacing;
        }

        rootYOffset += tree.subtreeHeight + levelSpacing * 2;
    }

    let orphanOffsetX = 100;
    const maxY = Math.max(...Array.from(positions.values()).map(p => p.y)) + levelSpacing * 2 || rootYOffset;
    for (const n of nodes) {
        if (!positions.has(n.id)) {
            positions.set(n.id, { x: orphanOffsetX, y: maxY });
            orphanOffsetX += (getSize(n).width + nodeSpacing);
        }
    }

    return positions;
}

// ─────────────── 树形图 (Tree Map / Org Chart) 布局 ───────────────

/**
 * 组织结构图 / 树形图布局
 * 类似于 treeLayout，但针对思维导图数据结构进行了深度适配，支持 TB (Top-to-Bottom) 和 BT (Bottom-to-Top)。
 */
export function treeMapLayout(
    nodes: Node[],
    edges: Edge[],
    direction: 'TB' | 'BT' = 'TB',
    options: LayoutOptions = {},
    externalMaps?: { nodeMap?: Map<string, Node>, childrenMap?: Map<string, string[]> }
): Map<string, Point> {
    const nodeSpacing = options.nodeSpacing ?? 50;
    const levelSpacing = options.levelSpacing ?? 80;

    const positions = new Map<string, Point>();
    if (nodes.length === 0) return positions;

    const getSize = (n: Node) => ({
        width: n.measured?.width ?? (n as any).width ?? 150,
        height: n.measured?.height ?? (n as any).height ?? 50,
    });

    const nodeMap = externalMaps?.nodeMap || new Map<string, Node>();
    if (!externalMaps?.nodeMap) {
        for (const n of nodes) nodeMap.set(n.id, n);
    }

    const childrenMap = externalMaps?.childrenMap || new Map<string, string[]>();
    const parentSet = new Set<string>();
    
    if (!externalMaps?.childrenMap) {
        const summaryNodeIds = new Set(nodes.filter(n => n.data?.isSummary).map(n => n.id));
        const realEdges = edges.filter(e => e.type !== 'relationshipEdge' && !summaryNodeIds.has(e.target));
        
        for (const e of realEdges) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
            parentSet.add(e.target);
        }
    } else {
        for (const [, kids] of childrenMap.entries()) {
            for (const kid of kids) parentSet.add(kid);
        }
    }

    const roots = nodes.filter(n => !parentSet.has(n.id));
    if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0]);

    const visited = new Set<string>();

    function buildTree(id: string): TreeNode {
        visited.add(id);
        const node = nodeMap.get(id);
        const { width: w, height: h } = node ? getSize(node) : { width: 150, height: 50 };
        const childIds = (childrenMap.get(id) || []).filter(cid => !visited.has(cid));
        const children = childIds.map(cid => buildTree(cid));
        const subtreeWidth = children.length > 0
            ? children.reduce((sum, c) => sum + c.subtreeWidth, 0) + (children.length - 1) * nodeSpacing
            : w;
        return { id, children, width: w, height: h, x: 0, y: 0, subtreeWidth };
    }

    function layoutSubtree(tree: TreeNode, x: number, y: number): void {
        tree.x = x + (tree.subtreeWidth - tree.width) / 2;
        tree.y = y;
        
        let childX = x;
        for (const child of tree.children) {
            const nextY = direction === 'TB' ? y + tree.height + levelSpacing : y - child.height - levelSpacing;
            layoutSubtree(child, childX, nextY);
            childX += child.subtreeWidth + nodeSpacing;
        }
        positions.set(tree.id, { x: tree.x, y: tree.y });
    }

    let offsetX = 100;
    for (const root of roots) {
        const tree = buildTree(root.id);
        const startY = direction === 'TB' ? 100 : 500; 
        layoutSubtree(tree, offsetX, startY);
        offsetX += tree.subtreeWidth + nodeSpacing * 2;
    }

    return positions;
}

// ─────────────── 鱼骨图 (Fishbone / Ishikawa) 布局 ───────────────

/**
 * 鱼骨图布局算法
 * 根节点（Effect）在最右侧，骨架向左延伸。
 * 第一层子节点（Main Causes）斜向排列，后续节点水平排列。
 */
export function fishboneLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {},
    externalMaps?: { nodeMap?: Map<string, Node>, childrenMap?: Map<string, string[]> }
): Map<string, Point> {
    const nodeSpacing = options.nodeSpacing ?? 40;
    const ribSpacing = 180; // Distance between ribs on the spine
    const slantHeight = 160; // Height of the slanted ribs
    const slantWidth = 120;  // Horizontal offset of the slanted ribs

    const positions = new Map<string, Point>();
    if (nodes.length === 0) return positions;

    const getSize = (n: Node) => ({
        width: n.measured?.width ?? (n as any).width ?? 140,
        height: n.measured?.height ?? (n as any).height ?? 40,
    });

    const nodeMap = externalMaps?.nodeMap || new Map<string, Node>();
    if (!externalMaps?.nodeMap) {
        for (const n of nodes) nodeMap.set(n.id, n);
    }

    const childrenMap = externalMaps?.childrenMap || new Map<string, string[]>();
    const parentSet = new Set<string>();
    
    if (!externalMaps?.childrenMap) {
        for (const e of edges.filter(e => e.type !== 'relationshipEdge')) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
            parentSet.add(e.target);
        }
    } else {
        for (const [, kids] of childrenMap.entries()) {
            for (const kid of kids) parentSet.add(kid);
        }
    }

    const roots = nodes.filter(n => !parentSet.has(n.id) || n.data?.depth === 0);
    if (roots.length === 0) return positions;
    
    // 1. Root (Effect) at the right
    const root = roots[0];
    const { height: rh } = getSize(root);
    
    const spineX = 1200;
    const spineY = 400;
    positions.set(root.id, { x: spineX, y: spineY - rh / 2 });

    const mainCauses = childrenMap.get(root.id) || [];
    
    // 2. Main Causes (Ribs)
    mainCauses.forEach((causeId, index) => {
        const isUpper = index % 2 === 0;
        const ribIndex = Math.floor(index / 2);
        
        // Base point on the spine (backwards from root)
        const baseX = spineX - (ribIndex + 1) * ribSpacing;
        const baseY = spineY;

        // Slant position
        const causeX = baseX - slantWidth;
        const causeY = isUpper ? baseY - slantHeight : baseY + slantHeight;
        
        const cNode = nodeMap.get(causeId);
        const { width: cw, height: ch } = cNode ? getSize(cNode) : { width: 140, height: 40 };
        positions.set(causeId, { x: causeX - cw / 2, y: causeY - ch / 2 });

        // 3. Sub-causes (Horizontal branches from ribs)
        const layoutSubCauses = (id: string, startX: number, startY: number, dir: 'up' | 'down') => {
            const subIds = childrenMap.get(id) || [];
            subIds.forEach((sid, sIdx) => {
                // Staggered horizontal layout
                const subX = startX - (sIdx + 1) * 90;
                const subY = startY; 
                
                positions.set(sid, { x: subX, y: subY });
                layoutSubCauses(sid, subX, subY, dir);
            });
        };
        
        layoutSubCauses(causeId, causeX, causeY, isUpper ? 'up' : 'down');
    });

    // 4. Handle remaining nodes (orphans)
    let orphanOffsetX = 100;
    const _minYFound = Math.min(...Array.from(positions.values()).map(p => p.y), spineY);
    const maxYFound = Math.max(...Array.from(positions.values()).map(p => p.y), spineY);

    for (const n of nodes) {
        if (!positions.has(n.id)) {
            positions.set(n.id, { x: orphanOffsetX, y: maxYFound + 200 });
            orphanOffsetX += (getSize(n).width + nodeSpacing);
        }
    }

    return positions;
}

export function autoMindMapLayout(
    nodes: Node[],
    edges: Edge[],
    direction: string = 'LR',
    options: LayoutOptions = {},
    externalMaps?: { nodeMap?: Map<string, Node>, childrenMap?: Map<string, string[]> }
): Map<string, Point> {
    if (direction === 'TB') {
        return treeMapLayout(nodes, edges, 'TB', options, externalMaps);
    }
    if (direction === 'BT') {
        return treeMapLayout(nodes, edges, 'BT', options, externalMaps);
    }
    if (direction === 'FISHBONE') {
        return fishboneLayout(nodes, edges, options, externalMaps);
    }
    if (direction === 'R' || direction === 'L') {
        return directionalMindMapLayout(nodes, edges, direction as 'L' | 'R', options, externalMaps);
    }
    return symmetricMindMapLayout(nodes, edges, options, externalMaps);
}
