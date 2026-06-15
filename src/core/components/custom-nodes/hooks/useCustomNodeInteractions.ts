import { useState, useCallback, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useNodeUpdate } from '../../diagrams/useNodeUpdate';

export interface UseCustomNodeInteractionsProps {
    id: string;
    data: any;
    propsWidth?: number;
}

export const useCustomNodeInteractions = ({
    id,
    data,
    propsWidth
}: UseCustomNodeInteractionsProps) => {
    const onUpdateNodeData = useNodeUpdate();
    const { setNodes } = useReactFlow();
    
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(String(data?.description ?? ''));

    // Sync external description changes into local editing text
    useEffect(() => {
        const timer = setTimeout(() => setEditText(String(data?.description ?? '')), 0);
        return () => clearTimeout(timer);
    }, [data?.description]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
    }, []);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        const currentDesc = String(data?.description ?? '');
        if (editText !== currentDesc) {
            const update = {
                data: {
                    ...data,
                    description: editText,
                    label: editText
                }
            };

            if (onUpdateNodeData) {
                onUpdateNodeData([id], update);
            } else {
                setNodes((nds) => nds.map((node) => {
                    if (node.id === id) {
                        return {
                            ...node,
                            ...update
                        };
                    }
                    return node;
                }));
            }

            // Notify parent if callback is provided
            if (typeof data.onLabelChange === 'function') {
                data.onLabelChange(id, editText);
            }
        }
    }, [editText, data, id, setNodes, onUpdateNodeData]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleBlur();
        }
    }, [handleBlur]);

    // Priority: props.width > data.measured.width > data.style.width
    const nodeWidth = propsWidth
        || (data?.measured?.width)
        || (typeof data?.style?.width === 'number' ? data.style.width : undefined)
        || undefined;

    return {
        isEditing,
        editText,
        nodeWidth,
        setEditText,
        handleDoubleClick,
        handleBlur,
        handleKeyDown
    };
};
