import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';

import { autoMindMapLayout, calculateSummaryGeometry, calculateSubtreeBounds } from '../../../utils/LayoutAlgorithms';
import { MIND_MAP_PALETTE } from './mindMapOrchestratorCommands';

const PALETTE = MIND_MAP_PALETTE;
type SummaryBracket = { minY: number; maxY: number; dir: string };

export function createMindMapLayoutSignature(nodes: Node[], edges: Edge[]): string {
    const structHashParts: string[] = [];
    const rootDataParts: string[] = [];
    const colorSigParts: string[] = [];
    for (const node of nodes) {
        if (node.type !== 'mindmap') continue;
        structHashParts.push(`${node.id}:${node.data?.collapsed ? 'C' : 'O'}`);
        const isRoot = node.data?.depth === 0
            || (node.data?.depth === undefined && node.data?.direction !== undefined);
        if (isRoot) {
            rootDataParts.push(
                `${node.id}:${node.data?.direction || 'LR'}:${node.data?.pathStyle || 'bezier'}:${node.data?.shape || 'pill'}`,
            );
        }
        if (node.data?.branchColor) colorSigParts.push(`${node.id}:${node.data.branchColor}`);
    }
    const edgeHashParts = edges
        .filter(edge => edge.type !== 'relationshipEdge')
        .map(edge => `${edge.source}->${edge.target}`);
    const structureSignature = `${structHashParts.join('|')}#${edgeHashParts.join('|')}`;
    const rootSignature = `${rootDataParts.join('|')}#C#${colorSigParts.join('|')}`;
    return `${structureSignature}##${rootSignature}`;
}

export function useMindMapAutoLayout(
    nodes: Node[],
    edges: Edge[],
    setNodes: Dispatch<SetStateAction<Node[]>>,
) {
    const prevRootDataRef = useRef<Record<string, string>>({});

    useLayoutEffect(() => {
        const finalSignature = createMindMapLayoutSignature(nodes, edges);
        const rootNodes = nodes.filter(n => n.type === 'mindmap' && (n.data?.depth === 0 || (n.data?.depth === undefined && n.data?.direction !== undefined)));

        if (prevRootDataRef.current['__global_sig__'] === finalSignature) {
            return;
        }
        prevRootDataRef.current['__global_sig__'] = finalSignature;

        // --- STEP 2: Lookup Acceleration (Map Building) ---
        // Only run when something meaningful changed.
        const nodeMap = new Map<string, Node>();
        nodes.forEach(n => nodeMap.set(n.id, n));

        const childrenMap = new Map<string, string[]>();
        const edgeMap = new Map<string, Edge>();
        const structureEdges = edges.filter(e => e.type !== 'relationshipEdge');

        for (const e of structureEdges) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
            edgeMap.set(`${e.source}->${e.target}`, e);
        }

        const nodeUpdates = new Map<string, Record<string, unknown>>();
        const newPositions = new Map<string, { x: number, y: number }>();
        const nodesToHide = new Set<string>();
        const edgesToHide = new Set<string>();

        // --- Pass 1: Tree Layout ---
        for (const root of rootNodes) {
            const direction = (root.data?.direction as string) || 'LR';
            const pathStyle = (root.data?.pathStyle as string) || 'bezier';
            const shape = (root.data?.shape as string) || 'pill';

            const subtreeNodes: Node[] = [];
            const subtreeEdges: Edge[] = [];

            const queue = [{ id: root.id, hideKids: false, inheritedColor: undefined as string | undefined }];
            while (queue.length > 0) {
                const { id: currId, hideKids, inheritedColor } = queue.shift()!;
                const currNode = nodeMap.get(currId);
                const kids = childrenMap.get(currId) || [];

                let effectiveColor = inheritedColor;
                if (currId === root.id) {
                    effectiveColor = undefined;
                } else if (!effectiveColor) {
                    if (currNode?.data?.branchColor) {
                        effectiveColor = currNode.data.branchColor as string;
                    } else {
                        const rootKids = childrenMap.get(root.id) || [];
                        const branchIndex = Math.max(0, rootKids.indexOf(currId));
                        effectiveColor = PALETTE[branchIndex % PALETTE.length];
                    }
                }

                if (currNode) {
                    if (hideKids) {
                        nodesToHide.add(currId);
                    } else {
                        subtreeNodes.push(currNode);
                    }
                    nodeUpdates.set(currId, {
                        direction,
                        pathStyle,
                        shape,
                        childrenCount: kids.length,
                        branchColor: currId !== root.id ? effectiveColor : undefined
                    });
                }

                const isCollapsed = currNode?.data?.collapsed === true;
                const nextHideKids = hideKids || isCollapsed;

                for (const k of kids) {
                    queue.push({ id: k, hideKids: nextHideKids, inheritedColor: effectiveColor });
                    const e = edgeMap.get(`${currId}->${k}`);
                    if (e) {
                         if (nextHideKids) edgesToHide.add(e.id);
                         else subtreeEdges.push(e);
                    }
                }
            }

            if (subtreeNodes.length > 0) {
                const pos = autoMindMapLayout(subtreeNodes, subtreeEdges, direction, {
                    nodeSpacing: 48,
                    levelSpacing: 140
                }, { nodeMap, childrenMap });
                for (const [nid, p] of pos.entries()) {
                    newPositions.set(nid, p);
                }
            }
        }

        // --- Pass 2: Boundary Calculation ---
        const boundaryNodes = nodes.filter(n => n.type === 'mindmap-boundary');
        const boundaryUpdates = new Map<string, { x: number, y: number, width: number, height: number }>();

        // Combined position map for child-relative calculations
        const combinedPosMap = new Map<string, { x: number, y: number }>();
        for (const n of nodes) combinedPosMap.set(n.id, n.position);
        for (const [nid, p] of newPositions.entries()) combinedPosMap.set(nid, p);

        for (const bNode of boundaryNodes) {
            const targetId = bNode.data?.targetSubtreeId as string;
            if (!targetId) continue;

            const bounds = calculateSubtreeBounds(targetId, combinedPosMap, nodeMap, childrenMap);
            if (bounds) {
                const padding = 30;
                boundaryUpdates.set(bNode.id, {
                    x: bounds.x - padding,
                    y: bounds.y - padding,
                    width: bounds.width + padding * 2,
                    height: bounds.height + padding * 2
                });
            }
        }

        // --- Pass 3: Summary Node Calculation ---
        const summaryNodes = nodes.filter(n => n.data?.isSummary);
        const summaryUpdates = new Map<string, { x: number, y: number, bracket?: SummaryBracket }>();
        const firstRoot = rootNodes[0];
        const globalDir = firstRoot?.data?.direction as string || 'LR';

        for (const sNode of summaryNodes) {
            const targets = (sNode.data?.summaryTargetIds || sNode.data?.summaryTargets) as string[];
            if (!targets || targets.length === 0) continue;

            const bounds = calculateSummaryGeometry(targets, combinedPosMap, nodeMap, globalDir);
            if (bounds) {
                const summaryW = sNode.measured?.width || 100;
                const summaryH = sNode.measured?.height || 40;
                const margin = 50;

                const newX = bounds.dir === 'L' ? bounds.x - margin - summaryW : bounds.x + margin;
                const newY = (bounds.minY + bounds.maxY) / 2 - summaryH / 2;

                const centerY = newY + summaryH / 2;
                const bracket = {
                    minY: bounds.minY - centerY,
                    maxY: bounds.maxY - centerY,
                    dir: bounds.dir
                };

                summaryUpdates.set(sNode.id, { x: newX, y: newY, bracket });
            }
        }

        // --- Pass 2.5: Boundary Reconciliation (Self-Healing) ---
        // Ensure that nodes with data.hasBoundary=true actually HAVE a boundary node,
        // and remove boundaries for nodes that turned it off.
        const nodesThatShouldHaveBoundary = new Set(nodes.filter(n => n.type === 'mindmap' && n.data?.hasBoundary).map(n => n.id));
        const existingBoundaryTargets = new Set(boundaryNodes.map(n => n.data?.targetSubtreeId as string).filter(Boolean));

        const boundariesToAdd: Node[] = [];
        const boundariesToRemove = new Set<string>();

        // Find missing boundaries
        for (const targetId of nodesThatShouldHaveBoundary) {
            if (!existingBoundaryTargets.has(targetId)) {
                const targetNode = nodeMap.get(targetId);
                if (targetNode) {
                    boundariesToAdd.push({
                        id: `boundary-${targetId}-${Date.now()}`,
                        type: 'mindmap-boundary',
                        position: { x: targetNode.position.x, y: targetNode.position.y },
                        data: { targetSubtreeId: targetId, label: 'Boundary' },
                        selectable: false,
                        zIndex: -1
                    });
                }
            }
        }

        // Find stale boundaries
        for (const bNode of boundaryNodes) {
            const tId = bNode.data?.targetSubtreeId as string;
            if (!nodesThatShouldHaveBoundary.has(tId)) {
                boundariesToRemove.add(bNode.id);
            }
        }

        // --- Final State Update ---
        setNodes(nds => {
            let changed = false;
            // 1. Remove stale boundaries
            let nextNodes = nds;
            if (boundariesToRemove.size > 0) {
                nextNodes = nextNodes.filter(n => !boundariesToRemove.has(n.id));
                changed = true;
            }

            // 2. Update existing nodes
            const updatedNodes = nextNodes.map(n => {
                let nChanged = false;
                let nextPos = { ...n.position };
                const nextData = { ...n.data };
                let nextHidden = n.hidden;

                // Position & Layout
                if (n.type === 'mindmap') {
                    const targetPos = newPositions.get(n.id);
                    if (targetPos && (Math.abs(targetPos.x - n.position.x) > 0.5 || Math.abs(targetPos.y - n.position.y) > 0.5)) {
                        nextPos = targetPos;
                        nChanged = true;
                    }

                    const update = nodeUpdates.get(n.id);
                    if (update) {
                        for (const key in update) {
                            if (nextData[key] !== update[key]) {
                                nextData[key] = update[key];
                                nChanged = true;
                            }
                        }
                    }

                    const shouldBeHidden = nodesToHide.has(n.id);
                    if (n.hidden !== shouldBeHidden) {
                        nextHidden = shouldBeHidden;
                        nChanged = true;
                    }
                }

                // Boundary Geometry
                if (n.type === 'mindmap-boundary') {
                    const bUpdate = boundaryUpdates.get(n.id);
                    if (bUpdate) {
                        if (Math.abs(n.position.x - bUpdate.x) > 0.5 || Math.abs(n.position.y - bUpdate.y) > 0.5) {
                            nextPos = { x: bUpdate.x, y: bUpdate.y };
                            nChanged = true;
                        }
                        if (n.data?.width !== bUpdate.width || n.data?.height !== bUpdate.height) {
                            nextData.width = bUpdate.width;
                            nextData.height = bUpdate.height;
                            nChanged = true;
                        }
                    }
                }

                // Summary Geometry
                if (n.data?.isSummary) {
                    const sUpdate = summaryUpdates.get(n.id);
                    if (sUpdate) {
                        if (Math.abs(n.position.x - sUpdate.x) > 0.5 || Math.abs(n.position.y - sUpdate.y) > 0.5) {
                            nextPos = { x: sUpdate.x, y: sUpdate.y };
                            nChanged = true;
                        }
                        if (JSON.stringify(n.data?.summaryBracket) !== JSON.stringify(sUpdate.bracket)) {
                            nextData.summaryBracket = sUpdate.bracket;
                            nChanged = true;
                        }
                    }
                }

                if (nChanged) {
                    changed = true;
                    return { ...n, position: nextPos, data: nextData, hidden: nextHidden };
                }
                return n;
            });

            // 3. Add new boundaries
            if (boundariesToAdd.length > 0) {
                return [...updatedNodes, ...boundariesToAdd];
            }

            return changed ? updatedNodes : nds;
        });

    }, [nodes, edges, setNodes]);
}
