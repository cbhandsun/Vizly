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
        for (const [parent, kids] of childrenMap.entries()) {
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
        for (const [parent, kids] of childrenMap.entries()) {
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
            let nextX = direction === 'R' 
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

        let childY = rootY + tree.height / 2 - tree.subtreeHeight / 2;
        
        const childrenHeightSum = tree.children.reduce((s, c) => s + c.subtreeHeight, 0) + Math.max(0, tree.children.length - 1) * nodeSpacing;
        childY = rootY + tree.height / 2 - childrenHeightSum / 2;

        for (const child of tree.children) {
            let nextX = direction === 'R' 
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
        for (const [parent, kids] of childrenMap.entries()) {
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
        for (const [parent, kids] of childrenMap.entries()) {
            for (const kid of kids) parentSet.add(kid);
        }
    }

    const roots = nodes.filter(n => !parentSet.has(n.id) || n.data?.depth === 0);
    if (roots.length === 0) return positions;
    
    // 1. Root (Effect) at the right
    const root = roots[0];
    const { width: rw, height: rh } = getSize(root);
    
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
                const sn = nodeMap.get(sid);
                const { width: sw, height: sh } = sn ? getSize(sn) : { width: 120, height: 35 };
                
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
    const minYFound = Math.min(...Array.from(positions.values()).map(p => p.y), spineY);
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

// ─────────────── 力导向布局 ───────────────

export interface ForceLayoutOptions {
    /** 迭代次数（默认 50） */
    iterations?: number;
    /** 理想节点间距（默认 150） */
    idealDistance?: number;
    /** 步长衰减（默认 0.3） */
    stepSize?: number;
}

/**
 * 力导向布局 (Spring-Force 模型)
 *
 * 算法：
 * - 所有节点对之间产生斥力 (Coulomb)
 * - 有连线的节点产生引力 (Hooke's Law)
 * - 迭代至收敛
 *
 * 适用场景：非层次化的关系图、自由连接网络
 *
 * @returns 每个节点的新位置
 */
export function forceDirectedLayout(
    nodes: Node[],
    edges: Edge[],
    options: ForceLayoutOptions = {},
): Map<string, Point> {
    const iterations = options.iterations ?? 50;
    const k = options.idealDistance ?? 150;
    const dt = options.stepSize ?? 0.3;

    const positions = new Map<string, Point>();
    if (nodes.length === 0) return positions;

    // 初始化：使用当前位置，若无则均匀分布在圆上
    const pos: Record<string, { x: number; y: number }> = {};
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        pos[n.id] = {
            x: n.position?.x ?? 400 + Math.cos(i * 2.4) * 200,
            y: n.position?.y ?? 300 + Math.sin(i * 2.4) * 200,
        };
    }

    for (let iter = 0; iter < iterations; iter++) {
        // 斥力（所有节点对）
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = pos[nodes[i].id];
                const b = pos[nodes[j].id];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
                const force = (k * k) / dist;
                const fx = (dx / dist) * force * dt;
                const fy = (dy / dist) * force * dt;
                a.x -= fx; a.y -= fy;
                b.x += fx; b.y += fy;
            }
        }

        // 引力（连线节点对）
        for (const e of edges) {
            const a = pos[e.source];
            const b = pos[e.target];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = (dist - k) / k;
            const fx = (dx / dist) * force * dt * 0.5;
            const fy = (dy / dist) * force * dt * 0.5;
            a.x += fx; a.y += fy;
            b.x -= fx; b.y -= fy;
        }
    }

    // 归一化到正坐标（左上角留 100px 边距）
    let minX = Infinity;
    let minY = Infinity;
    for (const p of Object.values(pos)) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
    }
    for (const n of nodes) {
        positions.set(n.id, {
            x: pos[n.id].x - minX + 100,
            y: pos[n.id].y - minY + 100,
        });
    }

    return positions;
}

/**
 * 便捷方法：将布局结果应用到 React Flow 节点数组
 *
 * @param nodes    当前节点数组
 * @param positions 布局计算结果
 * @returns 带新位置的节点数组
 */
export function applyLayout(nodes: Node[], positions: Map<string, Point>): Node[] {
    return nodes.map(n => {
        const pos = positions.get(n.id);
        if (!pos) return n;
        return { ...n, position: { x: pos.x, y: pos.y } };
    });
}

/**
 * 计算概要大括号 (Summary Bracket) 的几何范围
 * 
 * @param targetIds     被归纳的主题 ID 集合
 * @param nodePositions 当前所有节点的布局位置
 * @param nodeMap       当前所有节点映射
 * @param direction     布局主方向
 */
export function calculateSummaryGeometry(
    targetIds: string[],
    nodePositions: Map<string, Point>,
    nodeMap: Map<string, Node>,
    direction: string = 'LR'
) {
    let minY = Infinity;
    let maxY = -Infinity;
    let maxX = -Infinity;
    let minX = Infinity;

    let hasValid = false;
    for (const tid of targetIds) {
        const tn = nodeMap.get(tid);
        const pos = nodePositions.get(tid);
        if (!tn || !pos) continue;

        const h = tn.measured?.height ?? (tn as any).height ?? 40;
        const w = tn.measured?.width ?? (tn as any).width ?? 120;
        
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y + h);
        maxX = Math.max(maxX, pos.x + w);
        minX = Math.min(minX, pos.x);
        hasValid = true;
    }

    if (!hasValid) return null;

    const isLeft = direction === 'L'; 
    const bracketX = isLeft ? minX - 15 : maxX + 15;

    return {
        minY,
        maxY,
        x: bracketX,
        dir: isLeft ? 'L' : 'R'
    };
}

/**
 * 计算外框 (Boundary) 的几何范围，包裹指定节点及其所有子孙节点
 * 
 * @param rootId        子树根节点 ID
 * @param nodePositions 布局坐标
 * @param nodes         节点数组
 * @param edges         边数组（用于遍历子树）
 */
export function calculateSubtreeBounds(
    rootId: string,
    nodePositions: Map<string, Point>,
    nodeMap: Map<string, Node>,
    childrenMap: Map<string, string[]>
) {
    const descendants = new Set<string>();
    const stack = [rootId];
    
    // Optimized DFS using childrenMap
    while (stack.length > 0) {
        const id = stack.pop()!;
        if (descendants.has(id)) continue;
        descendants.add(id);
        const kids = childrenMap.get(id) || [];
        for (const k of kids) {
            stack.push(k);
        }
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const id of descendants) {
        const pos = nodePositions.get(id);
        const node = nodeMap.get(id);
        if (!pos || !node) continue;
        
        const w = node.measured?.width ?? (node as any).width ?? 140;
        const h = node.measured?.height ?? (node as any).height ?? 44;

        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + w);
        maxY = Math.max(maxY, pos.y + h);
    }

    if (minX === Infinity) return null;

    const padding = 24; 
    return {
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + padding * 2,
        height: (maxY - minY) + padding * 2
    };
}
