import { useEffect, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { autoMindMapLayout } from '../../../utils/LayoutAlgorithms';
import { parseIndentedText } from '../../../utils/textTreeParser';
import {
    MIND_MAP_PALETTE,
    collectMindMapSubtree,
    createMindMapPastePayload,
    createMindMapQuickAdd,
    type MindMapClipboard,
} from './mindMapOrchestratorCommands';
import { downloadMindMapMarkdown } from './mindMapMarkdown';
import { useMindMapAutoLayout } from './useMindMapAutoLayout';
import { useMindMapSupplementalCommands } from './useMindMapSupplementalCommands';

export const PALETTE: readonly string[] = MIND_MAP_PALETTE;
export { exportMindMapToMarkdown } from './mindMapMarkdown';

let mindmapClipboard: MindMapClipboard | null = null;

export function useMindMapOrchestrator(
    nodes: Node[],
    edges: Edge[],
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    takeSnapshot: () => void
) {
    useMindMapAutoLayout(nodes, edges, setNodes);
    const handleQuickAdd = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail || !detail.parentId) return;

        const { parentId, direction, depth } = detail;

        // 1. Take a snapshot for undo/redo before structural changes
        takeSnapshot();

        const siblingCount = edges.filter((edge) => edge.source === parentId).length;
        const parentBranchColor = nodes.find((node) => node.id === parentId)
            ?.data?.branchColor as string | undefined;
        const { node: newNode, edge: newEdge } = createMindMapQuickAdd({
            parentId,
            direction: typeof direction === 'string' ? direction : 'LR',
            depth: typeof depth === 'number' ? depth : 0,
            siblingCount,
            parentBranchColor,
            idSeed: Date.now(),
        });

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
    }, [edges, nodes, setEdges, setNodes, takeSnapshot]);

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
    }, [edges, nodes, setEdges, setNodes, takeSnapshot]);

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

                // [M-6] Build a local nodeMap for O(1) position lookups inside sort comparator.
                // Previous: nodes.find() inside sort = O(K·log(K)·N). Now: O(K·log(K)).
                const localNodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]));
                const getChildrenIds = (nodeId: string) => edges.filter(ed => ed.source === nodeId && ed.type !== 'relationshipEdge')
                    .map(ed => ed.target)
                    .sort((a, b) => {
                        const na = localNodeMap.get(a);
                        const nb = localNodeMap.get(b);
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

            // ── T-1: Ctrl+C — Copy selected subtree to mindmapClipboard ────────
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
                const selectedMindNodes = nodes.filter(n => n.selected && n.type === 'mindmap');
                if (selectedMindNodes.length === 1) {
                    const copyRoot = selectedMindNodes[0];
                    mindmapClipboard = collectMindMapSubtree(nodes, edges, copyRoot.id);
                    // Also write plain text label to system clipboard for cross-app paste
                    try { navigator.clipboard?.writeText((copyRoot.data?.label as string) || ''); } catch { /* ignore */ }
                    e.stopPropagation(); // Don't let designer's copy handler fire
                }
            }

            // ── T-1: Ctrl+V — Paste mindmapClipboard subtree ───────────────────
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey && mindmapClipboard) {
                const targetNodes = nodes.filter(n => n.selected && n.type === 'mindmap');
                if (targetNodes.length === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    const target = targetNodes[0];
                    const payload = createMindMapPastePayload(mindmapClipboard, target.id, Date.now());
                    if (!payload) return;

                    takeSnapshot();
                    setEdges(eds => [...eds, ...payload.edges]);
                    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...payload.nodes]);
                }
            }

            // ── T-2: Ctrl+Shift+E — Export current mindmap as Markdown ─────────
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'e') {
                e.preventDefault();
                downloadMindMapMarkdown(nodes, edges);
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [edges, nodes, setEdges, setNodes, takeSnapshot]);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return; // Let native inputs handle paste normally
            }

            // [T-1] If there's a mindmap subtree in our internal clipboard, the Ctrl+V
            // handler in handleKeyDown above will handle it. Bail out here so we
            // don't also try to parse the system clipboard text as indented structure.
            if (mindmapClipboard && (e as any)._mindmapHandled) return;

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
    }, [edges, nodes, setEdges, setNodes, takeSnapshot]);

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

            // [M-5] Build O(1) lookup map for nextNodes to avoid O(N) find() inside traverse().
            // Previous: nextNodes.find() inside each recursive call = O(N²) for large trees.
            const nextNodeMap = new Map<string, Node>(nextNodes.map(n => [n.id, n]));

            const roots = nextNodes.filter(n => n.type === 'mindmap' && !parentSet.has(n.id));
            const visibilityMap = new Map<string, { hidden: boolean, count: number }>();

            function traverse(currentId: string, parentHidden: boolean, parentCollapsed: boolean): number {
                // [M-5] O(1) map lookup instead of O(N) find()
                const node = nextNodeMap.get(currentId);
                const selfCollapsed = !!node?.data?.collapsed;
                const isHidden = parentHidden || parentCollapsed;
                
                let descendants = 0;
                const children = childrenMap.get(currentId) || [];
                for (const childId of children) {
                    descendants += 1; 
                    const childDescendants = traverse(childId, isHidden, selfCollapsed);
                    descendants += childDescendants;
                }

                visibilityMap.set(currentId, { hidden: isHidden, count: children.length });
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

            // Note: edge hidden-state sync is handled by React Flow natively —
            // RF auto-hides edges whose source or target node is hidden.

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



    }, [edges, setNodes, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('mindmap:toggle-collapse', handleToggleCollapse);
        return () => window.removeEventListener('mindmap:toggle-collapse', handleToggleCollapse);
    }, [handleToggleCollapse]);

    // ── Collapse ALL non-root nodes ────────────────────────────────────────────
    const handleCollapseAll = useCallback(() => {
        takeSnapshot();
        setNodes(currentNodes => {
            const edgeChildMap = new Map<string, string[]>();
            edges.forEach(e => {
                if (e.type === 'relationshipEdge') return;
                if (!edgeChildMap.has(e.source)) edgeChildMap.set(e.source, []);
                edgeChildMap.get(e.source)!.push(e.target);
            });

            // Only collapse depth-1 nodes (direct children of root) — collapses whole subtrees
            return currentNodes.map(n => {
                if (n.type !== 'mindmap') return n;
                const d = n.data?.depth as number | undefined;
                const isRoot = d === 0 || (d === undefined && n.data?.direction !== undefined);
                if (isRoot) return n;
                const hasKids = (edgeChildMap.get(n.id) || []).length > 0;
                if (!hasKids) return n;
                return { ...n, data: { ...n.data, collapsed: true } };
            });
        });
    }, [edges, setNodes, takeSnapshot]);

    // ── Expand ALL nodes ───────────────────────────────────────────────────────
    const handleExpandAll = useCallback(() => {
        takeSnapshot();
        setNodes(currentNodes =>
            currentNodes.map(n => {
                if (n.type !== 'mindmap') return n;
                if (!n.data?.collapsed) return n;
                return { ...n, data: { ...n.data, collapsed: false }, hidden: false };
            })
        );
    }, [setNodes, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('mindmap:collapseAll', handleCollapseAll);
        window.addEventListener('mindmap:expandAll', handleExpandAll);
        return () => {
            window.removeEventListener('mindmap:collapseAll', handleCollapseAll);
            window.removeEventListener('mindmap:expandAll', handleExpandAll);
        };
    }, [handleCollapseAll, handleExpandAll]);



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
        
        const newEdges = [...filteredEdges];
        
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

    }, [edges, nodes, setEdges, setNodes, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('mindmap:reparent', handleReparent);
        return () => window.removeEventListener('mindmap:reparent', handleReparent);
    }, [handleReparent]);

    useMindMapSupplementalCommands(nodes, setNodes, setEdges, takeSnapshot);
}
