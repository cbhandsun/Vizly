import { useEffect, useCallback } from 'react';
import { Node, Edge, XYPosition } from '@xyflow/react';
import { autoMindMapLayout } from '../../../utils/LayoutAlgorithms';
import { useRef } from 'react';
import { parseIndentedText } from '../../../utils/textTreeParser';

export const PALETTE = ['#f43f5e', '#f97316', '#eab308', '#10b981', '#0ea5e9', '#6366f1', '#d946ef'];

export function useMindMapOrchestrator(
    nodes: Node[],
    edges: Edge[],
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    takeSnapshot: () => void
) {
    const prevRootDataRef = useRef<Record<string, string>>({});

    // Watch for root direction & style changes to sync them down and trigger relayout
    useEffect(() => {
        const rootNodes = nodes.filter(n => n.type === 'mindmap' && n.data?.depth === 0);
        if (rootNodes.length === 0) return;

        let needsSync = false;
        const currentRootData: Record<string, string> = {};

        for (const root of rootNodes) {
            const dir = (root.data?.direction as string) || 'LR';
            const shape = (root.data?.shape as string) || 'pill';
            const pathStyle = (root.data?.pathStyle as string) || 'bezier';
            const key = `${dir}|${shape}|${pathStyle}`;
            currentRootData[root.id] = key;
            if (prevRootDataRef.current[root.id] !== key) {
                needsSync = true;
            }
        }

        if (!needsSync) return;
        prevRootDataRef.current = currentRootData;
        
        // Build adjacency map (ignoring relationships)
        const childrenMap = new Map<string, string[]>();
        const structureEdges = edges.filter(e => e.type !== 'relationshipEdge');

        for (const e of structureEdges) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
        }

        const nodeUpdates = new Map<string, any>();
        const newPositions = new Map<string, XYPosition>();

        for (const root of rootNodes) {
            const direction = (root.data?.direction as string) || 'LR';
            const pathStyle = (root.data?.pathStyle as string) || 'bezier';
            const shape = (root.data?.shape as string) || 'pill';

            const subtreeNodes: Node[] = [];
            const subtreeEdges: Edge[] = [];

            const queue = [root.id];
            while (queue.length > 0) {
                const currId = queue.shift()!;
                const currNode = nodes.find(n => n.id === currId);
                
                if (currNode) {
                    subtreeNodes.push(currNode);
                    if (currId !== root.id) {
                        nodeUpdates.set(currId, { direction, pathStyle, shape });
                    }
                }
                
                const kids = childrenMap.get(currId) || [];
                for (const k of kids) {
                    queue.push(k);
                    const e = edges.find(edge => edge.source === currId && edge.target === k);
                    if (e) subtreeEdges.push(e);
                }
            }

            const visibleNodes = subtreeNodes.filter(n => !n.hidden);
            const visibleEdges = subtreeEdges.filter(e => !e.hidden);
            
            if (visibleNodes.length > 0) {
                const pos = autoMindMapLayout(visibleNodes, visibleEdges, direction, {
                    nodeSpacing: 48,
                    levelSpacing: 140
                });
                for (const [nid, p] of pos.entries()) {
                    newPositions.set(nid, p);
                }
            }
        }

        // --- Pass 2: Boundary Node Calculation ---
        const boundaryNodes = nodes.filter(n => n.type === 'mindmap-boundary');
        const boundaryUpdates = new Map<string, { x: number, y: number, width: number, height: number }>();
        const boundaryPadding = 30;

        for (const bNode of boundaryNodes) {
            const targetId = bNode.data?.targetSubtreeId as string;
            if (!targetId) continue;

            const getSubNodes = (currentId: string, acc: Set<string>) => {
                acc.add(currentId);
                const kids = childrenMap.get(currentId) || [];
                for (const k of kids) {
                    getSubNodes(k, acc);
                }
            };
            const targetSet = new Set<string>();
            getSubNodes(targetId, targetSet);

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let hasValidNodes = false;

            for (const nid of targetSet) {
                const n = nodes.find(x => x.id === nid);
                if (!n || n.hidden) continue;

                const posX = newPositions.get(nid)?.x ?? n.position.x;
                const posY = newPositions.get(nid)?.y ?? n.position.y;
                const width = n.measured?.width || (n.data?.width as number) || 150;
                const height = n.measured?.height || (n.data?.height as number) || 50;

                if (posX < minX) minX = posX;
                if (posY < minY) minY = posY;
                if (posX + width > maxX) maxX = posX + width;
                if (posY + height > maxY) maxY = posY + height;
                hasValidNodes = true;
            }

            if (hasValidNodes) {
                boundaryUpdates.set(bNode.id, {
                    x: minX - boundaryPadding,
                    y: minY - boundaryPadding,
                    width: (maxX - minX) + boundaryPadding * 2,
                    height: (maxY - minY) + boundaryPadding * 2
                });
            }
        }
        
        setNodes(nds => {
            let changed = false;
            const nextNodes = nds.map(n => {
                if (n.type !== 'mindmap') return n;
                
                let nChanged = false;
                const newData = { ...n.data };
                
                const update = nodeUpdates.get(n.id);
                if (update) {
                    if (newData.pathStyle !== update.pathStyle) { newData.pathStyle = update.pathStyle; nChanged = true; }
                    if (newData.shape !== update.shape) { newData.shape = update.shape; nChanged = true; }
                    if (newData.direction !== update.direction) { newData.direction = update.direction; nChanged = true; }
                }
                
                let newPos = n.position;
                const targetPos = newPositions.get(n.id);
                if (targetPos && (targetPos.x !== n.position.x || targetPos.y !== n.position.y)) {
                    newPos = targetPos;
                    nChanged = true;
                }
                
                if (nChanged) {
                    changed = true;
                    return { ...n, position: newPos, data: newData };
                }
                return n;
            });

            // Second pass for non-mindmap node updates that orchestrated nodes
            const finalNodes = nextNodes.map(n => {
                if (n.type === 'mindmap-boundary') {
                    const bUpdate = boundaryUpdates.get(n.id);
                    if (bUpdate) {
                        let bChanged = false;
                        const newData = { ...n.data };
                        
                        if (newData.width !== bUpdate.width) { newData.width = bUpdate.width; bChanged = true; }
                        if (newData.height !== bUpdate.height) { newData.height = bUpdate.height; bChanged = true; }
                        
                        if (n.position.x !== bUpdate.x || n.position.y !== bUpdate.y) {
                            bChanged = true;
                        }
                        
                        if (bChanged) {
                            changed = true;
                            return { ...n, position: { x: bUpdate.x, y: bUpdate.y }, data: newData };
                        }
                    }
                }
                return n;
            });

            // Pass 2.5: Boundary Nodes Reconciliation
            // If any mindmap node has `data.hasBoundary`, ensure a boundary node exists for it.
            // If it doesn't have it, ensure it's removed.
            const requiredBoundaries = new Set<string>();
            let nextFinalNodes = [...finalNodes];
            let nodesAddedOrRemoved = false;

            nds.forEach(n => {
                if (n.type === 'mindmap' && n.data?.hasBoundary) {
                    requiredBoundaries.add(n.id);
                    const bId = `boundary-for-${n.id}`;
                    if (!nextFinalNodes.find(x => x.id === bId)) {
                        nextFinalNodes.push({
                            id: bId,
                            type: 'mindmap-boundary',
                            position: { x: n.position.x, y: n.position.y },
                            data: { targetSubtreeId: n.id, width: 100, height: 100 }
                        });
                        nodesAddedOrRemoved = true;
                    }
                }
            });

            const toRemove = nextFinalNodes.filter(n => {
                if (n.type === 'mindmap-boundary') {
                    const tid = n.data?.targetSubtreeId as string;
                    if (!tid || !requiredBoundaries.has(tid)) return true;
                }
                return false;
            });

            if (toRemove.length > 0) {
                nextFinalNodes = nextFinalNodes.filter(n => !toRemove.includes(n));
                nodesAddedOrRemoved = true;
            }

            // Pass 2.6: Summary Nodes Coordinate Sync
            const summaryUpdates = new Map<string, { x: number, y: number, bracket?: { minY: number, maxY: number, dir: string } }>();
            nextFinalNodes.forEach(sNode => {
                if (sNode.data?.isSummary) {
                    const targets = sNode.data?.summaryTargets as string[];
                    if (targets && targets.length > 0) {
                        let totalY = 0;
                        let maxRightX = -Infinity;
                        let minLeftX = Infinity;
                        let count = 0;
                        
                        // Infer global direction from target nodes to decide if we put summary on right or left
                        let inferredDir = 'R'; 
                        
                        let minTargetY = Infinity;
                        let maxTargetY = -Infinity;

                        targets.forEach(tid => {
                            const tNode = nextFinalNodes.find(x => x.id === tid);
                            if (tNode) {
                                const px = tNode.position.x;
                                const py = tNode.position.y;
                                const w = tNode.measured?.width || 120;
                                const h = tNode.measured?.height || 50;
                                const cy = py + h/2;
                                totalY += cy; // Use center Y
                                if (cy < minTargetY) minTargetY = cy;
                                if (cy > maxTargetY) maxTargetY = cy;
                                if (px + w > maxRightX) maxRightX = px + w;
                                if (px < minLeftX) minLeftX = px;
                                count++;
                                
                                // Determine direction by checking parent relation:
                                // If node is explicitly LR bounded, check where it is relative to root. 
                                // But simple heuristic: if it's L direction, its data.direction is 'L', else 'R'/'TB'
                                if (tNode.data?.direction === 'L') inferredDir = 'L';
                            }
                        });
                        
                        if (count > 0) {
                            const avgY = totalY / count;
                            // Summary node dimensions approx 100x40
                            const summaryW = sNode.measured?.width || 100;
                            const summaryH = sNode.measured?.height || 40;
                            
                            const margin = 60; // Distance from targets to summary
                            const newX = inferredDir === 'L' ? minLeftX - margin - summaryW : maxRightX + margin;
                            const newY = avgY - summaryH / 2;
                            
                            // Calculate local relative coordinates for bracket
                            // Target center Y's relative to summary node's center Y
                            const localMinY = minTargetY - avgY;
                            const localMaxY = maxTargetY - avgY;
                            
                            const bracket = { minY: localMinY, maxY: localMaxY, dir: inferredDir };
                            
                            if (Math.abs(sNode.position.x - newX) > 1 || Math.abs(sNode.position.y - newY) > 1 || JSON.stringify(sNode.data?.summaryBracket) !== JSON.stringify(bracket)) {
                                summaryUpdates.set(sNode.id, { x: newX, y: newY, bracket });
                            }
                        }
                    }
                }
            });

            if (summaryUpdates.size > 0) {
                nextFinalNodes = nextFinalNodes.map(n => {
                    const update = summaryUpdates.get(n.id);
                    if (update) {
                        return { 
                            ...n, 
                            position: { x: update.x, y: update.y },
                            data: { ...n.data, summaryBracket: update.bracket }
                        };
                    }
                    return n;
                });
                nodesAddedOrRemoved = true;
            }

            return (changed || nodesAddedOrRemoved) ? nextFinalNodes : nds;
        });

    }, [nodes, edges, setNodes]);

    const handleQuickAdd = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail || !detail.parentId) return;

        const { parentId, direction, depth } = detail;

        // 1. Take a snapshot for undo/redo before structural changes
        takeSnapshot();

        // 2. Generate new node ID
        const newChildId = `mindmap-node-${Date.now()}`;

        // 3. Determine Color (Inherit or Assign new)
        let branchColor = undefined;
        if (depth === 0) {
            // It's a new root branch
            const siblingCount = edges.filter(ed => ed.source === parentId).length;
            branchColor = PALETTE[siblingCount % PALETTE.length];
        } else {
            // Inherit from parent
            const parentNode = nodes.find(n => n.id === parentId);
            branchColor = parentNode?.data?.branchColor as string | undefined;
        }

        // 4. Create the new Node object
        const newNode: Node = {
            id: newChildId,
            type: 'mindmap',
            position: { x: 0, y: 0 }, 
            data: {
                label: '',
                depth: depth + 1,
                direction: direction,
                branchColor: branchColor,
                isNew: true
            },
        };

        // 5. Create proper semantic edge
        const newEdge: Edge = {
            id: `edge-${parentId}-${newChildId}`,
            source: parentId,
            target: newChildId,
            type: 'mindmapEdge', // Pure MindMap Custom Edge
            animated: false, 
            style: { 
                strokeWidth: Math.max(1.5, 4 - depth * 0.8), 
                stroke: branchColor || (depth === 0 ? '#6366f1' : '#94a3b8') 
            },
            data: { kind: 'mindmap' },
            markerEnd: '' as any // Explicitly remove default arrowheads
        };

        // 6. Use functional updates ensuring exact latest state.
        setEdges(currentEdges => {
            const nextEdges = [...currentEdges, newEdge];
            
            setNodes(currentNodes => {
                const nextNodes = [...currentNodes, newNode];
                const mindmapNodes = nextNodes.filter(n => n.type === 'mindmap');
                
                
                // Find root direction
                const rootNode = mindmapNodes.find(n => n.id === parentId || (n.data?.depth === 0));
                const direction = rootNode?.data?.direction as string || 'LR';

                const positions = autoMindMapLayout(mindmapNodes, nextEdges, direction, {
                    nodeSpacing: 48,
                    levelSpacing: 140 // wider for layout
                });

                return nextNodes.map(n => {
                    if (n.type === 'mindmap' && positions.has(n.id)) {
                        return { ...n, position: positions.get(n.id)! };
                    }
                    return n;
                });
            });

            return nextEdges;
        });
    }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('mindmap:quickadd', handleQuickAdd);
        return () => window.removeEventListener('mindmap:quickadd', handleQuickAdd);
    }, [handleQuickAdd]);

    useEffect(() => {
        const handleShortcutTrigger = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail || !detail.nodeId || !detail.key) return;
            
            const selected = nodes.find(n => n.id === detail.nodeId);
            if (!selected) return;

            if (detail.key === 'Tab') {
                // Add Child
                const event = new CustomEvent('mindmap:quickadd', {
                    detail: {
                        parentId: selected.id,
                        direction: selected.data?.direction ?? 'LR',
                        depth: selected.data?.depth ?? 0
                    }
                });
                window.dispatchEvent(event);
            } else if (detail.key === 'Enter') {
                // Add Sibling
                const depth = (selected.data?.depth as number) ?? 0;
                if (depth === 0) {
                    const event = new CustomEvent('mindmap:quickadd', {
                        detail: {
                            parentId: selected.id,
                            direction: selected.data?.direction ?? 'LR',
                            depth: 0
                        }
                    });
                    window.dispatchEvent(event);
                    return;
                }

                const parentEdge = edges.find(edge => edge.target === selected.id && edge.type !== 'relationshipEdge');
                if (parentEdge) {
                     const parentNode = nodes.find(n => n.id === parentEdge.source);
                     if (parentNode) {
                          const event = new CustomEvent('mindmap:quickadd', {
                              detail: {
                                  parentId: parentNode.id,
                                  direction: parentNode.data?.direction ?? 'LR',
                                  depth: parentNode.data?.depth ?? 0
                              }
                          });
                          window.dispatchEvent(event);
                      }
                 }
            }
        };

        window.addEventListener('mindmap:shortcut-trigger', handleShortcutTrigger);
        return () => window.removeEventListener('mindmap:shortcut-trigger', handleShortcutTrigger);
    }, [nodes, edges]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input or textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            const selectedNodes = nodes.filter(n => n.selected && n.type === 'mindmap');
            if (selectedNodes.length === 1) {
                const selected = selectedNodes[0];
                const side = selected.data?.side as string || 'root';

                // Helpers for structural traversal
                const selectNode = (targetId: string) => {
                    setNodes(ns => ns.map(n => ({
                        ...n,
                        selected: n.id === targetId
                    })));
                };

                const getParentId = (nodeId: string) => edges.find(ed => ed.target === nodeId && ed.type !== 'relationshipEdge')?.source;
                
                const getChildrenIds = (nodeId: string) => edges.filter(ed => ed.source === nodeId && ed.type !== 'relationshipEdge')
                    .map(ed => ed.target)
                    .sort((a, b) => {
                        const na = nodes.find(n => n.id === a);
                        const nb = nodes.find(n => n.id === b);
                        return (na?.position?.y || 0) - (nb?.position?.y || 0); // Top to bottom sort
                    });

                const getSiblings = (nodeId: string) => {
                    const pid = getParentId(nodeId);
                    if (!pid) return [];
                    return getChildrenIds(pid);
                };

                // Inline Edit Call
                if (e.key === 'F2' || e.key === ' ') {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('mindmap:edit', { detail: { nodeId: selected.id } }));
                    return;
                }

                // Prevent default canvas panning on structural arrows
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault(); 
                    e.stopPropagation();
                }

                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    const sibs = getSiblings(selected.id);
                    const idx = sibs.indexOf(selected.id);
                    if (idx > -1) {
                        if (e.key === 'ArrowUp' && idx > 0) selectNode(sibs[idx - 1]);
                        if (e.key === 'ArrowDown' && idx < sibs.length - 1) selectNode(sibs[idx + 1]);
                    }
                } 
                else if (e.key === 'ArrowRight') {
                    if (side === 'left') {
                        // Go to parent
                        const pid = getParentId(selected.id);
                        if (pid) selectNode(pid);
                    } else {
                        // Go to child (right side or root)
                        const children = getChildrenIds(selected.id);
                        const rightChildren = side === 'root' ? children.filter(c => nodes.find(n => n.id === c)?.data?.side === 'right') : children;
                        if (rightChildren.length > 0) {
                             selectNode(rightChildren[Math.floor(rightChildren.length / 2)]);
                        }
                    }
                } 
                else if (e.key === 'ArrowLeft') {
                    if (side === 'right') {
                        // Go to parent
                        const pid = getParentId(selected.id);
                        if (pid) selectNode(pid);
                    } else {
                        // Go to child (left side or root)
                        const children = getChildrenIds(selected.id);
                        const leftChildren = side === 'root' ? children.filter(c => nodes.find(n => n.id === c)?.data?.side === 'left') : children;
                        if (leftChildren.length > 0) {
                             selectNode(leftChildren[Math.floor(leftChildren.length / 2)]);
                        }
                    }
                } 
                else if (e.key === 'Tab' || e.key === 'Enter') {
                    e.preventDefault(); 
                    
                    if (e.key === 'Tab') {
                        // Add Child
                        const event = new CustomEvent('mindmap:quickadd', {
                            detail: {
                                parentId: selected.id,
                                direction: selected.data?.direction ?? 'LR',
                                depth: selected.data?.depth ?? 0
                            }
                        });
                        window.dispatchEvent(event);
                    } else if (e.key === 'Enter') {
                        // Add Sibling
                        const depth = (selected.data?.depth as number) ?? 0;
                        if (depth === 0) {
                            // If root is selected, Enter adds a child to the root just like Tab
                             const event = new CustomEvent('mindmap:quickadd', {
                                detail: {
                                    parentId: selected.id,
                                    direction: selected.data?.direction ?? 'LR',
                                    depth: 0
                                }
                            });
                            window.dispatchEvent(event);
                            return;
                        }

                        // For depth > 0, find the parent Node to add a sibling
                        const parentEdge = edges.find(edge => edge.target === selected.id && edge.type !== 'relationshipEdge');
                        if (parentEdge) {
                             const parentNode = nodes.find(n => n.id === parentEdge.source);
                             if (parentNode) {
                                  const event = new CustomEvent('mindmap:quickadd', {
                                      detail: {
                                          parentId: parentNode.id,
                                          direction: parentNode.data?.direction ?? 'LR',
                                          depth: parentNode.data?.depth ?? 0
                                      }
                                  });
                                  window.dispatchEvent(event);
                              }
                         }
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [nodes, edges]);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return; // Let native inputs handle paste normally
            }

            const clipboardData = e.clipboardData;
            if (!clipboardData) return;
            const text = clipboardData.getData('text/plain');
            if (!text || text.trim().length === 0) return;

            const selectedNodes = nodes.filter(n => n.selected && n.type === 'mindmap');
            if (selectedNodes.length === 1) {
                const targetNode = selectedNodes[0];
                const parsedTrees = parseIndentedText(text);
                if (parsedTrees.length === 0) return;
                
                // Only intercept if we actually found meaningul multiline structure
                // Or if it's just one line, maybe we don't intercept? Let's intercept always if a node is selected
                e.preventDefault();
                e.stopPropagation();

                takeSnapshot();

                const newNodes: Node[] = [];
                const newEdges: Edge[] = [];
                
                const rootDepth = (targetNode.data?.depth as number) ?? 0;
                const rootDirection = (targetNode.data?.direction as string) ?? 'LR';
                const branchColor = targetNode.data?.branchColor as string | undefined;

                let nodeIdCounter = Date.now();

                const traverseAndCreate = (parsedNode: any, parentId: string, currentDepth: number) => {
                    const newId = `mindmap-node-${nodeIdCounter++}`;
                    
                    const nDesc: Node = {
                        id: newId,
                        type: 'mindmap',
                        position: { x: targetNode.position.x, y: targetNode.position.y },
                        data: {
                            label: parsedNode.label,
                            depth: currentDepth,
                            direction: rootDirection,
                            branchColor: branchColor || PALETTE[0],
                            isNew: true
                        }
                    };
                    newNodes.push(nDesc);

                    const eDesc: Edge = {
                        id: `edge-${parentId}-${newId}`,
                        source: parentId,
                        target: newId,
                        type: 'mindmapEdge',
                        animated: false,
                        style: {
                            strokeWidth: Math.max(1.5, 4 - currentDepth * 0.8),
                            stroke: branchColor || (currentDepth === 1 ? '#6366f1' : '#94a3b8')
                        },
                        data: { kind: 'mindmap' },
                        markerEnd: '' as any
                    };
                    newEdges.push(eDesc);

                    for (const child of parsedNode.children) {
                        traverseAndCreate(child, newId, currentDepth + 1);
                    }
                };

                for (const tree of parsedTrees) {
                    traverseAndCreate(tree, targetNode.id, rootDepth + 1);
                }

                setEdges(currentEdges => {
                    const nextEdges = [...currentEdges, ...newEdges];
                    setNodes(currentNodes => {
                        const nextNodes = [...currentNodes, ...newNodes];
                        // Force layout
                        const mindmapNodes = nextNodes.filter(n => n.type === 'mindmap' && !n.hidden);
                        const visibleEdges = nextEdges.filter(ed => !ed.hidden);

                        // Find absolute root for correct alignment base
                        const topRoot = mindmapNodes.find(n => n.data?.depth === 0);
                        const dir = (topRoot?.data?.direction as string) || 'LR';

                        const positions = autoMindMapLayout(mindmapNodes, visibleEdges, dir, {
                            nodeSpacing: 48,
                            levelSpacing: 140
                        });

                        return nextNodes.map(n => {
                            if (n.type === 'mindmap' && positions.has(n.id)) {
                                return { ...n, position: positions.get(n.id)! };
                            }
                            return n;
                        });
                    });
                    return nextEdges;
                });
            }
        };

        window.addEventListener('paste', handlePaste, { capture: true });
        return () => window.removeEventListener('paste', handlePaste, { capture: true });
    }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

    const handleToggleCollapse = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail || !detail.nodeId) return;
        const { nodeId } = detail;

        takeSnapshot();

        setNodes(currentNodes => {
            const targetNode = currentNodes.find(n => n.id === nodeId);
            if (!targetNode) return currentNodes;

            const isCurrentlyCollapsed = !!targetNode.data?.collapsed;
            
            // 1. Toggle collapse state on target
            let nextNodes = currentNodes.map(n => {
                if (n.id === nodeId) {
                    return { ...n, data: { ...n.data, collapsed: !isCurrentlyCollapsed } };
                }
                return n;
            });

            // 2. Compute visibility for all nodes based on tree structure
            const childrenMap = new Map<string, string[]>();
            const parentSet = new Set<string>();
            edges.forEach(e => {
                if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
                childrenMap.get(e.source)!.push(e.target);
                parentSet.add(e.target);
            });

            const roots = nextNodes.filter(n => n.type === 'mindmap' && !parentSet.has(n.id));
            const visibilityMap = new Map<string, { hidden: boolean, count: number }>();

            function traverse(currentId: string, parentHidden: boolean, parentCollapsed: boolean): number {
                const node = nextNodes.find(n => n.id === currentId);
                const selfCollapsed = !!node?.data?.collapsed;
                const isHidden = parentHidden || parentCollapsed;
                
                let descendants = 0;
                const children = childrenMap.get(currentId) || [];
                for (const childId of children) { // Only direct children count towards the 1 increment, then their descendants add recursively
                    descendants += 1; 
                    const childDescendants = traverse(childId, isHidden, selfCollapsed);
                    descendants += childDescendants;
                }

                visibilityMap.set(currentId, { hidden: isHidden, count: children.length }); // Only showing direct children count looks cleaner
                return descendants;
            }

            roots.forEach(root => traverse(root.id, false, false));

            // Apply visibility
            nextNodes = nextNodes.map(n => {
                if (n.type === 'mindmap') {
                    const viz = visibilityMap.get(n.id);
                    if (viz) {
                        return { 
                            ...n, 
                            hidden: viz.hidden, 
                            data: { ...n.data, childrenCount: viz.count }
                        };
                    }
                }
                return n;
            });

            // 3. Layout the branch again using only visible nodes
            setEdges(currentEdges => {
                const nextEdges = currentEdges.map(e => {
                    const targetViz = visibilityMap.get(e.target);
                    if (targetViz) return { ...e, hidden: targetViz.hidden };
                    return e;
                });

                const visibleNodes = nextNodes.filter(n => n.type === 'mindmap' && !n.hidden);
                const visibleEdges = nextEdges.filter(e => !e.hidden);

                const rootNode = visibleNodes.find(n => n.data?.depth === 0);
                const direction = rootNode?.data?.direction as string || 'LR';

                const positions = autoMindMapLayout(visibleNodes, visibleEdges, direction, {
                    nodeSpacing: 48,
                    levelSpacing: 140
                });

                return nextEdges; // Wait, setEdges should return edges. We need to set node positions carefully since we're in setNodes.
                // Wait, we can't `setEdges` and process node layout inside it cleanly without side effects.
                // See later fix: layout will be applied below.
            });

            // Applying layout to nodes directly within setNodes
            const visibleNodes = nextNodes.filter(n => n.type === 'mindmap' && !n.hidden);
            const visibleEdges = edges.map(e => {
                const viz = visibilityMap.get(e.target);
                return viz ? { ...e, hidden: viz.hidden } : e;
            }).filter(e => !e.hidden);

            const rootNode = visibleNodes.find(n => n.data?.depth === 0);
            const direction = rootNode?.data?.direction as string || 'LR';

            const positions = autoMindMapLayout(visibleNodes, visibleEdges, direction, {
                nodeSpacing: 48,
                levelSpacing: 140
            });

            return nextNodes.map(n => {
                if (n.type === 'mindmap' && positions.has(n.id)) {
                    return { ...n, position: positions.get(n.id)! };
                }
                return n;
            });
        });

        // Update edges state directly as well
        setEdges(currentEdges => {
             const childrenMap = new Map<string, string[]>();
             const parentSet = new Set<string>();
             // We need to re-evaluate the target node visibility here, or just let target node `.hidden` sync via FlowchartDesigner? 
             // React Flow's native `.hidden` on Node automatically ignores attached edges. But it's safer to explicitly set it.
             // But we don't have nextNodes here. 
             // That's fine, we will just manually hide edges based on target's visibility we calculate again or rely on Node's hidden property directly (RF hides edges of hidden nodes).
             // Actually, we SHOULD sync edge hidden state. For simplicity, we just use the event to trigger layout, RF hides edges automatically if nodes are hidden!
             return currentEdges;
        });

    }, [nodes, edges, setNodes, setEdges, takeSnapshot]);


    useEffect(() => {
        window.addEventListener('mindmap:toggle-collapse', handleToggleCollapse);
        return () => window.removeEventListener('mindmap:toggle-collapse', handleToggleCollapse);
    }, [handleToggleCollapse]);


    const handleReparent = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail || !detail.nodeId || !detail.targetId) return;

        const { nodeId, targetId, position = 'inside' } = detail;
        
        // 0. Determine Actual Parent
        let actualParentId = targetId;
        if (position !== 'inside') {
             const targetEdge = edges.find(ed => ed.target === targetId && ed.type !== 'relationshipEdge');
             if (targetEdge) {
                 actualParentId = targetEdge.source;
             } else {
                 // Fallback: If dropped on root, force insert as child
                 actualParentId = targetId;
             }
        }

        
        // 1. Get subtree to ensure no circular parenting
        const getSubtreeIds = (rootId: string, _edges: Edge[]): string[] => {
            const children = _edges.filter(ed => ed.source === rootId && ed.type !== 'relationshipEdge').map(ed => ed.target);
            return [rootId, ...children.flatMap(c => getSubtreeIds(c, _edges))];
        };

        const currentSubtree = getSubtreeIds(nodeId, edges);
        if (currentSubtree.includes(actualParentId)) {
             // Cycle detected, abort
             return;
        }

        takeSnapshot();

        // 2. Link Swapping & Magnetic Ordering
        // Filter out the old structural connection to nodeId (keep relationship edges intact)
        const filteredEdges = edges.filter(edge => edge.target !== nodeId || edge.type === 'relationshipEdge');
        
        let newEdges = [...filteredEdges];
        
        // Determine insertion index based on sibling's edge location
        let insertIndex = -1;
        if (actualParentId !== targetId && (position === 'above' || position === 'below')) {
            const targetEdgeIndex = newEdges.findIndex(ed => ed.target === targetId);
            if (targetEdgeIndex !== -1) {
                insertIndex = position === 'above' ? targetEdgeIndex : targetEdgeIndex + 1;
            }
        }

        const edgeBase = edges.find(ed => ed.target === nodeId && ed.type !== 'relationshipEdge');
        const newTargetEdge: Edge = edgeBase 
               ? { ...edgeBase, source: actualParentId } 
               : { id: `edge-${actualParentId}-${nodeId}-${Date.now()}`, source: actualParentId, target: nodeId, type: 'mindmap' };

        if (insertIndex !== -1) {
            newEdges.splice(insertIndex, 0, newTargetEdge);
        } else {
            newEdges.push(newTargetEdge);
        }

        // 3. Compute Properties Inheritance
        const targetNode = nodes.find(n => n.id === actualParentId);
        if (!targetNode) return;
        const targetDepth = (targetNode.data?.depth as number) ?? 0;
        
        let newColor = targetNode.data?.branchColor as string | undefined;
        if (targetDepth === 0) {
             // Use original mapped index across all children to determine color consistency
             const childrenEdges = newEdges.filter(ed => ed.source === actualParentId);
             const childIndex = childrenEdges.findIndex(ed => ed.target === nodeId);
             newColor = PALETTE[Math.max(0, childIndex) % PALETTE.length];
        }

        const nodeCurrentDepth = nodes.find(n => n.id === nodeId)?.data?.depth as number ?? 1;
        const depthDelta = (targetDepth + 1) - nodeCurrentDepth;
        const subtreeSet = new Set(currentSubtree);

        // 4. Update Node Subtree (Depths and Colors)
        const nextNodes = nodes.map(n => {
             if (subtreeSet.has(n.id)) {
                 const currentDepth = (n.data?.depth as number) ?? 1;
                 return {
                     ...n,
                     data: {
                         ...n.data,
                         depth: currentDepth + depthDelta,
                         branchColor: newColor
                     }
                 };
             }
             return n;
        });

        // 5. Update Edge Subtree (Thickness and Colors)
        const finalEdges = newEdges.map(edge => {
             if (subtreeSet.has(edge.target)) {
                  const targetDepthInTree = nextNodes.find(n => n.id === edge.target)?.data?.depth as number ?? 1;
                  return {
                      ...edge,
                      animated: false,
                      style: {
                          ...edge.style,
                          strokeWidth: Math.max(1.5, 4 - (targetDepthInTree - 1) * 0.8),
                          stroke: newColor || '#6366f1'
                      },
                      markerEnd: '' as any
                  };
             }
             return edge;
        });

        // 6. Recalculate Layout
        const visibleNodes = nextNodes.filter(n => n.type === 'mindmap' && !n.hidden);
        const visibleEdges = finalEdges.filter(e => !e.hidden);

        const rootNodeForLayout = visibleNodes.find(n => n.data?.depth === 0);
        const direction = rootNodeForLayout?.data?.direction as string || 'LR';

        const positions = autoMindMapLayout(visibleNodes, visibleEdges, direction, {
             nodeSpacing: 48,
             levelSpacing: 140
        });

        const rootNodes = visibleNodes.filter(n => (n.data?.depth as number ?? 0) === 0);
        
        const positionedNodes = nextNodes.map(n => {
             if (n.type === 'mindmap' && positions.has(n.id)) {
                 const pos = positions.get(n.id)!;
                 let side: 'left' | 'right' | 'root' = 'root';
                 
                 const d = n.data?.depth as number ?? 0;
                 if (d > 0 && rootNodes.length > 0) {
                     // Determine side relative to nearest root or primary root
                     const rootPos = positions.get(rootNodes[0].id) ?? { x: 0, y: 0 };
                     side = pos.x > rootPos.x ? 'right' : 'left';
                 }

                 return { 
                     ...n, 
                     position: pos,
                     data: { ...n.data, side }
                 };
             }
             return n;
        });

        // 8. Bind Source Handles for Root Edges
        const fullyRoutedEdges = finalEdges.map(edge => {
            const sourceNode = positionedNodes.find(n => n.id === edge.source);
            if (sourceNode && (sourceNode.data?.depth as number ?? 0) === 0) {
                const targetNode = positionedNodes.find(n => n.id === edge.target);
                const targetSide = targetNode?.data?.side as string;
                if (targetSide === 'left') {
                    return { ...edge, sourceHandle: 'source-left' };
                } else {
                    return { ...edge, sourceHandle: 'source-right' };
                }
            }
            return edge;
        });

        setNodes(positionedNodes);
        setEdges(fullyRoutedEdges);

    }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('mindmap:reparent', handleReparent);
        return () => window.removeEventListener('mindmap:reparent', handleReparent);
    }, [handleReparent]);

}
