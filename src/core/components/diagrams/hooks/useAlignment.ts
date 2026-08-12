import { useCallback, useMemo } from 'react';
import { Node } from '@xyflow/react';

interface UseAlignmentProps {
    selectedNodes: Node[];
    onUpdateNodes: (updates: { id: string, position: { x: number, y: number } }[]) => void;
}

const readNodeWidth = (node: Node): number => node.measured?.width || node.width || 100;
const readNodeHeight = (node: Node): number => node.measured?.height || node.height || 50;

const positionChanged = (
    node: Node,
    position: Readonly<{ x: number; y: number }>,
): boolean => node.position.x !== position.x || node.position.y !== position.y;

export const useAlignment = ({ selectedNodes: _selectedNodes, onUpdateNodes }: UseAlignmentProps) => {
    const selectedNodes = useMemo(() => _selectedNodes || [], [_selectedNodes]);
    const canAlign = selectedNodes.length > 1;
    const canDistribute = selectedNodes.length > 2;

    const handleAlign = useCallback((type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        if (!canAlign) return;

        // Calculate BBox of selection
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        selectedNodes.forEach(n => {
            const w = n.measured?.width || n.width || 0;
            const h = n.measured?.height || n.height || 0;
            minX = Math.min(minX, n.position.x);
            maxX = Math.max(maxX, n.position.x + w);
            minY = Math.min(minY, n.position.y);
            maxY = Math.max(maxY, n.position.y + h);
        });

        // Center points
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const updates = selectedNodes.map(n => {
            const w = readNodeWidth(n);
            const h = readNodeHeight(n);
            let newX = n.position.x;
            let newY = n.position.y;

            switch (type) {
                case 'left': newX = minX; break;
                case 'center': newX = centerX - w / 2; break;
                case 'right': newX = maxX - w; break;
                case 'top': newY = minY; break;
                case 'middle': newY = centerY - h / 2; break;
                case 'bottom': newY = maxY - h; break;
            }

            return { id: n.id, position: { x: newX, y: newY } };
        });

        if (updates.some(update => {
            const node = selectedNodes.find(candidate => candidate.id === update.id);
            return node ? positionChanged(node, update.position) : false;
        })) {
            onUpdateNodes(updates);
        }
    }, [selectedNodes, onUpdateNodes, canAlign]);

    const handleDistribute = useCallback((type: 'horizontal' | 'vertical') => {
        if (!canDistribute) return;

        // Sort nodes by position
        const sorted = [...selectedNodes].sort((a, b) => {
            if (type === 'horizontal') return a.position.x - b.position.x;
            return a.position.y - b.position.y;
        });

        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalSize = sorted.reduce((sum, node) => (
            sum + (type === 'horizontal' ? readNodeWidth(node) : readNodeHeight(node))
        ), 0);
        const start = type === 'horizontal' ? first.position.x : first.position.y;
        const end = type === 'horizontal'
            ? last.position.x + readNodeWidth(last)
            : last.position.y + readNodeHeight(last);
        const gap = (end - start - totalSize) / (sorted.length - 1);
        let cursor = start;

        const updates = sorted.map((node) => {
            const position = {
                x: type === 'horizontal' ? cursor : node.position.x,
                y: type === 'vertical' ? cursor : node.position.y,
            };
            cursor += (type === 'horizontal' ? readNodeWidth(node) : readNodeHeight(node)) + gap;
            return { id: node.id, position };
        });

        if (updates.some(update => {
            const node = selectedNodes.find(candidate => candidate.id === update.id);
            return node ? positionChanged(node, update.position) : false;
        })) {
            onUpdateNodes(updates);
        }

    }, [selectedNodes, onUpdateNodes, canDistribute]);

    return {
        canAlign,
        canDistribute,
        handleAlign,
        handleDistribute
    };
};
