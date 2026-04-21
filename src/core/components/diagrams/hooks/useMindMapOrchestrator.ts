import { useEffect, useCallback, useLayoutEffect } from 'react';
import { Node, Edge, XYPosition } from '@xyflow/react';
import { autoMindMapLayout, calculateSummaryGeometry, calculateSubtreeBounds } from '../../../utils/LayoutAlgorithms';
import { useRef } from 'react';
import { parseIndentedText } from '../../../utils/textTreeParser';

export const PALETTE = ['#f43f5e', '#f97316', '#eab308', '#10b981', '#0ea5e9', '#6366f1', '#d946ef'];

// ─── T-1: Module-level mindmap clipboard (subtree copy/paste) ───────────────
// Stored at module scope so it persists across renders without triggering re-renders.
interface MindMapClipboard {
    nodes: Node[];
    edges: Edge[];
    rootId: string;
}
let mindmapClipboard: MindMapClipboard | null = null;

// ─── T-2: Markdown export utility ───────────────────────────────────────────
/**
 * Exports a mindmap to Markdown format (XMind-compatible indented structure).
 * Root becomes # heading, children become nested - list items.
 */
export function exportMindMapToMarkdown(nodes: Node[], edges: Edge[]): string {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const childrenMap = new Map<string, string[]>();
    for (const e of edges) {
        if (e.type === 'relationshipEdge') continue;
        if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
        childrenMap.get(e.source)!.push(e.target);
    }
    const root = nodes.find(n => n.type === 'mindmap' && (n.data?.depth === 0 || n.data?.depth === undefined));
    if (!root) return '';

    const lines: string[] = [];
    function dfs(nodeId: string, depth: number) {
        const node = nodeMap.get(nodeId);
        if (!node) return;
        // Strip HTML tags from label for clean Markdown output
        const label = ((node.data?.label as string) || 'Untitled').replace(/<[^>]+>/g, '').trim();
        lines.push(depth === 0 ? `# ${label}` : `${'  '.repeat(depth - 1)}- ${label}`);
        const children = (childrenMap.get(nodeId) || []).sort((a, b) => {
            const na = nodeMap.get(a);
            const nb = nodeMap.get(b);
            return (na?.position?.y ?? 0) - (nb?.position?.y ?? 0);
        });
        children.forEach(c => dfs(c, depth + 1));
    }
    dfs(root.id, 0);
    return lines.join('\n');
}

/** Triggers a browser file download with the given text content */
function downloadTextFile(filename: string, content: string, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function useMindMapOrchestrator(
    nodes: Node[],
    edges: Edge[],
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    takeSnapshot: () => void
) {
    const prevRootDataRef = useRef<Record<string, string>>({});

    useLayoutEffect(() => {
        // --- STEP 1: Lightweight Structural Signature ---
        // We calculate a cheap hash first to see if we can skip map building.
        // HASH includes: set of IDs, collapsed state, measured dimensions (if available)
        const structHashParts: string[] = [];
        for (const n of nodes) {
            if (n.type === 'mindmap') {
                structHashParts.push(`${n.id}:${n.data?.collapsed ? 'C' : 'O'}`);
            }
        }
        const edgeHashParts: string[] = [];
        for (const e of edges) {
            if (e.type !== 'relationshipEdge') {
                edgeHashParts.push(`${e.source}->${e.target}`);
            }
        }
        const currentSignature = `${structHashParts.join('|')}#${edgeHashParts.join('|')}`;

        // Check if any root properties changed
        const rootNodes = nodes.filter(n => n.type === 'mindmap' && n.data?.depth === 0);
        const rootDataParts: string[] = [];
        for (const root of rootNodes) {
             rootDataParts.push(`${root.id}:${root.data?.direction || 'LR'}:${root.data?.pathStyle || 'bezier'}:${root.data?.shape || 'pill'}`);
        }
        const rootSignature = rootDataParts.join('|');
        const finalSignature = `${currentSignature}##${rootSignature}`;

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

        const nodeUpdates = new Map<string, any>();
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
        const summaryUpdates = new Map<string, { x: number, y: number, bracket?: any }>();
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
                let nextData = { ...n.data };
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
                changed = true;
                return [...updatedNodes, ...boundariesToAdd];
            }

            return changed ? updatedNodes : nds;
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
            // [M-5] Use setNodes functional update's snapshot via nodes closure (already updated by the time callback runs)
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
                    // DFS collect entire subtree
                    const subtreeNodeIds = new Set<string>();
                    const stack = [copyRoot.id];
                    const edgeChildMap = new Map<string, string[]>();
                    for (const ed of edges) {
                        if (ed.type === 'relationshipEdge') continue;
                        if (!edgeChildMap.has(ed.source)) edgeChildMap.set(ed.source, []);
                        edgeChildMap.get(ed.source)!.push(ed.target);
                    }
                    while (stack.length > 0) {
                        const cur = stack.pop()!;
                        subtreeNodeIds.add(cur);
                        (edgeChildMap.get(cur) || []).forEach(c => stack.push(c));
                    }
                    const subtreeNodes = nodes.filter(n => subtreeNodeIds.has(n.id));
                    const subtreeEdges = edges.filter(ed => subtreeNodeIds.has(ed.source) && subtreeNodeIds.has(ed.target));
                    mindmapClipboard = { nodes: subtreeNodes, edges: subtreeEdges, rootId: copyRoot.id };
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
                    const clip = mindmapClipboard;

                    takeSnapshot();

                    // Remap IDs to avoid collisions
                    const idMap = new Map<string, string>();
                    const ts = Date.now();
                    clip.nodes.forEach((n, i) => { idMap.set(n.id, `mindmap-paste-${ts}-${i}`); });

                    const pastedNodes: Node[] = clip.nodes.map(n => ({
                        ...n,
                        id: idMap.get(n.id)!,
                        position: {
                            x: n.position.x + 40,
                            y: n.position.y + 40,
                        },
                        selected: n.id === clip.rootId,
                        data: { ...n.data }
                    }));
                    const pastedEdges: Edge[] = [
                        // Edge connecting target -> paste root
                        {
                            id: `edge-${target.id}-${idMap.get(clip.rootId)}`,
                            source: target.id,
                            target: idMap.get(clip.rootId)!,
                            type: 'mindmapEdge',
                            animated: false,
                            markerEnd: '' as any,
                            data: { kind: 'mindmap' }
                        },
                        // Internal subtree edges with remapped IDs
                        ...clip.edges.map(ed => ({
                            ...ed,
                            id: `edge-${idMap.get(ed.source)}-${idMap.get(ed.target)}`,
                            source: idMap.get(ed.source)!,
                            target: idMap.get(ed.target)!
                        }))
                    ];

                    setEdges(eds => [...eds, ...pastedEdges]);
                    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...pastedNodes]);
                }
            }

            // ── T-2: Ctrl+Shift+E — Export current mindmap as Markdown ─────────
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'e') {
                e.preventDefault();
                const md = exportMindMapToMarkdown(nodes, edges);
                if (md) {
                    const rootLabel = nodes.find(n => n.type === 'mindmap' && n.data?.depth === 0)?.data?.label as string || 'mindmap';
                    const safeFilename = rootLabel.replace(/[^a-zA-Z0-9一-龥]/g, '_').substring(0, 40);
                    downloadTextFile(`${safeFilename}.md`, md, 'text/markdown');
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



    }, [nodes, edges, setNodes, takeSnapshot]);


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

    const handleAddSummary = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail || !detail.sourceIds) return;

        takeSnapshot();
        const newId = `summary-${Date.now()}`;
        const newNode: Node = {
            id: newId,
            type: 'mindmap',
            position: { x: 0, y: 0 },
            data: {
                label: '概要总结',
                isSummary: true,
                summaryTargetIds: detail.sourceIds,
                depth: 10,
            }
        };

        setNodes(nds => [...nds, newNode]);
    }, [setNodes, takeSnapshot]);

    const handleAddBoundary = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        const nodeId = detail?.sourceId || detail?.nodeId;
        const nodeIds = detail?.nodeIds || (nodeId ? [nodeId] : []);
        
        if (nodeIds.length === 0) return;

        takeSnapshot();
        const newId = `boundary-${Date.now()}`;
        const newNode: Node = {
            id: newId,
            type: 'mindmap-boundary',
            position: { x: 0, y: 0 }, // Will be calculated by orchestrator
            data: {
                targetSubtreeIds: nodeIds,
                label: '逻辑外框',
                width: 100,
                height: 100,
            }
        };

        setNodes(nds => [...nds, newNode]);
    }, [setNodes, takeSnapshot]);

    const handleCreateRelationship = useCallback((e: Event) => {
        // Since we can't easily trigger connection programmatically across hooks without exposing internal RF state,
        // we use a message to guide the user. Professional tools often use this "mode" state.
        const detail = (e as CustomEvent).detail;
        if (detail?.sourceId) {
            // Highlighting the source node to guide the user
            setNodes(nds => nds.map(n => n.id === detail.sourceId ? { ...n, className: 'relationship-hint' } : n));
            setTimeout(() => {
                setNodes(nds => nds.map(n => n.id === detail.sourceId ? { ...n, className: '' } : n));
            }, 2000);
            
            // @ts-ignore
            if (window.antdMessage) {
                // @ts-ignore
                window.antdMessage.info('请拖动节点右侧红色手柄到目标节点');
            }
        }
    }, [setNodes]);

    const handleSmartDelete = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail;
        const targetIds = detail?.nodeIds || [];
        if (targetIds.length === 0) return;

        takeSnapshot();

        const nodeIdsToDelete = new Set<string>(targetIds);
        
        setEdges(currentEdges => {
            const nextEdges: Edge[] = [];
            const edgesToTransfer: { source: string, target: string, color?: string }[] = [];

            // 1. Identify edges to preserve and edges to "repair"
            currentEdges.forEach(edge => {
                const isSourceDeleted = nodeIdsToDelete.has(edge.source);
                const isTargetDeleted = nodeIdsToDelete.has(edge.target);

                if (isTargetDeleted) {
                    // Edge going to a deleted node -> ignore it, but check its children
                    return;
                }

                if (isSourceDeleted) {
                    // Edge coming from a deleted node -> this child is now orphaned
                    // Find the deleted node's parent to re-graft
                    const deletedNodeId = edge.source;
                    const parentEdge = currentEdges.find(ed => ed.target === deletedNodeId && ed.type !== 'relationshipEdge');
                    
                    if (parentEdge) {
                        // Re-graft to grandparent
                        edgesToTransfer.push({ 
                            source: parentEdge.source, 
                            target: edge.target,
                            color: edge.style?.stroke as string
                        });
                    }
                    return;
                }

                nextEdges.push(edge);
            });

            // 2. Add repaired edges
            edgesToTransfer.forEach(({ source, target, color }) => {
                const newId = `re-edge-${source}-${target}-${Date.now()}`;
                const targetNode = nodes.find(n => n.id === target);
                const depth = targetNode?.data?.depth as number ?? 1;
                
                nextEdges.push({
                    id: newId,
                    source,
                    target,
                    type: 'mindmapEdge',
                    style: {
                        strokeWidth: Math.max(1.5, 4 - (depth - 1) * 0.8),
                        stroke: color || '#6366f1'
                    },
                    data: { kind: 'mindmap' }
                });
            });

            // 3. Filter Nodes
            setNodes(currentNodes => {
                const nextNodes = currentNodes.filter(n => !nodeIdsToDelete.has(n.id));
                return nextNodes;
            });

            return nextEdges;
        });
    }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('mindmap:smart-delete', handleSmartDelete);
        window.addEventListener('editor:add-summary-node', handleAddSummary);
        window.addEventListener('editor:add-boundary-node', handleAddBoundary);
        window.addEventListener('editor:create-relationship-edge', handleCreateRelationship);
        return () => {
            window.removeEventListener('mindmap:smart-delete', handleSmartDelete);
            window.removeEventListener('editor:add-summary-node', handleAddSummary);
            window.removeEventListener('editor:add-boundary-node', handleAddBoundary);
            window.removeEventListener('editor:create-relationship-edge', handleCreateRelationship);
        };
    }, [handleSmartDelete, handleAddSummary, handleAddBoundary, handleCreateRelationship]);
}
