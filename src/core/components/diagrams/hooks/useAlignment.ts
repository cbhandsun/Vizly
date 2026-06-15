import { useCallback, useMemo } from 'react';
import { Node } from '@xyflow/react';

interface UseAlignmentProps {
    selectedNodes: Node[];
    onUpdateNodes: (updates: { id: string, position: { x: number, y: number } }[]) => void;
}

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
            const w = n.measured?.width || n.width || 0;
            const h = n.measured?.height || n.height || 0;
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

        onUpdateNodes(updates);
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

        const minPos = type === 'horizontal' ? first.position.x : first.position.y;
        const maxPos = type === 'horizontal' ? last.position.x : last.position.y;

        const totalSpan = maxPos - minPos;
        const step = totalSpan / (sorted.length - 1);

        const updates = sorted.map((n, index) => {
            const newPos = minPos + step * index;
            return {
                id: n.id,
                position: {
                    x: type === 'horizontal' ? newPos : n.position.x,
                    y: type === 'vertical' ? newPos : n.position.y
                }
            };
        });

        onUpdateNodes(updates);

    }, [selectedNodes, onUpdateNodes, canDistribute]);

    return {
        canAlign,
        canDistribute,
        handleAlign,
        handleDistribute
    };
};
