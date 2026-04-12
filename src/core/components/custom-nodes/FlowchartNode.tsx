import React, { memo } from 'react';
import { Handle, Position, NodeProps, NodeResizer, Node, NodeToolbar, useStore } from '@xyflow/react';
import { FlowchartNodeGraphics } from './renderers/FlowchartNodeGraphics';
import { useFlowchartNodeInteractions } from './hooks/useFlowchartNodeInteractions';
import { useFlowchartNodeStyleResolution, DOMAIN_CLASSES } from './hooks/useFlowchartNodeStyleResolution';
import { EditableLabel } from '../diagrams/EditableLabel';
import type { FlowchartNodeData } from './FlowchartNode';
import { FaTrash, FaCopy, FaChevronUp, FaChevronRight, FaChevronDown, FaChevronLeft } from 'react-icons/fa';
import './FlowchartNode.css';

export interface FlowchartNodeProps extends NodeProps<Node<FlowchartNodeData>> { }

const FlowchartNode = ({ data, selected, id, dragging }: FlowchartNodeProps) => {
    const isConnecting = useStore((s) => s.connection.inProgress);
    const nodeData = useStore((s: any) => s.nodeLookup?.get(id) || s.nodeInternals?.get(id));

    const nodeWidth = (nodeData?.measured?.width || (nodeData as any)?.width || 150) as number;
    const nodeHeight = (nodeData?.measured?.height || (nodeData as any)?.height || 80) as number;

    const {
        isHovered,
        setIsHovered,
        bounceAnimate,
        contentRef,
        editStartRef,
        handleUpdateData,
        handleDelete,
        handleClone,
        handleDomainClassChange,
        handleQuickClone
    } = useFlowchartNodeInteractions(id as string, data, selected);

    const {
        preset,
        shape,
        computedRadius,
        mainColor,
        finalBorderColor,
        finalBgColor,
        resolvedIcon,
        businessState,
        nodeStyle
    } = useFlowchartNodeStyleResolution({ data, selected });

    const isNonRectShape = shape !== 'rectangle';

    return (
        <div
            className={`flowchart-node ${selected ? 'selected' : ''} ${bounceAnimate ? 'bounce-animate' : ''} ${data.locked ? 'locked' : ''} ${preset.name} ${isNonRectShape ? 'shape-non-rect' : ''} ${businessState?.status === 'error' ? 'error-pulse' : ''}`}
            style={nodeStyle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="treeitem"
            aria-label={`${shape} 节点: ${data.label || id}${selected ? ' (已选中)' : ''}${data.locked ? ' (已锁定)' : ''}`}
            aria-selected={selected}
            tabIndex={0}
        >

            <NodeResizer
                minWidth={80}
                minHeight={40}
                maxWidth={600}
                maxHeight={400}
                color="#3b82f6"
                isVisible={selected}
                handleClassName="flowchart-resize-handle"
                lineClassName="flowchart-resize-line"
            />

            <FlowchartNodeGraphics
                id={id}
                shape={shape as any}
                data={data}
                preset={preset}
                selected={selected}
                isHovered={isHovered}
                nodeWidth={nodeWidth}
                nodeHeight={nodeHeight}
                computedRadius={computedRadius}
                mainColor={mainColor}
                finalBorderColor={finalBorderColor}
                finalBgColor={finalBgColor}
            />

            {preset.name === 'glass' && shape === 'rectangle' && (
                <div className="flowchart-glass-bg" />
            )}

            <div
                ref={contentRef}
                className="flowchart-node-content"
                style={{
                    paddingLeft: shape === 'parallelogram' ? '25px' : undefined,
                    paddingRight: shape === 'parallelogram' ? '25px' : undefined,
                }}
            >
                {(() => {
                    const raw = data.description || data.label || '';

                    if (data.isEditing) {
                        return (
                            <EditableLabel
                                value={raw}
                                onChange={(val) => {
                                    handleUpdateData({ label: val, description: undefined, isEditing: false });
                                }}
                                isEditing={true}
                                onEditingChange={(editing) => {
                                    if (!editing) {
                                        if (editStartRef.current && Date.now() - editStartRef.current < 300) {
                                            return;
                                        }
                                        handleUpdateData({ isEditing: false });
                                    } else {
                                        editStartRef.current = Date.now();
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    textAlign: data.textAlign || 'center',
                                    outline: 'none',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}
                                className="flowchart-node-editable-container"
                                autoFocus
                            />
                        );
                    }

                    const lines = raw.includes('<br')
                        ? raw.split(/<br\s*\/?>/i)
                        : raw.split('\n');
                    const titleLine = lines[0]?.trim() || '';
                    const bodyLines = lines.slice(1).filter((l: string) => l.trim());

                    return (
                        <div
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleUpdateData({ isEditing: true });
                            }}
                            style={{ cursor: 'text', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', textAlign: data.textAlign || 'center' }}
                            title="Double click to edit"
                        >
                            {titleLine && (
                                <div className="flowchart-node-title">
                                    {resolvedIcon && <span className="flowchart-node-icon" style={{ color: mainColor }}>{resolvedIcon}</span>}
                                    <span dangerouslySetInnerHTML={{ __html: titleLine }} style={{ pointerEvents: 'none' }} />
                                </div>
                            )}
                            {bodyLines.length > 0 && (
                                <div className="flowchart-node-body">
                                    {bodyLines.map((line: string, i: number) => (
                                        <div key={i} className="flowchart-node-body-line" dangerouslySetInnerHTML={{ __html: line }} style={{ pointerEvents: 'none' }} />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {(['top', 'right', 'bottom', 'left'] as const).map((dir) => {
                const posMap = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
                const IconMap = { top: FaChevronUp, right: FaChevronRight, bottom: FaChevronDown, left: FaChevronLeft };
                const Icon = IconMap[dir];
                const showQuickBtn = (isHovered || selected) && !data.locked;
                return (
                    <Handle
                        key={dir}
                        type="source"
                        position={posMap[dir]}
                        id={dir}
                        className={`flowchart-handle flowchart-handle-bidirectional${showQuickBtn ? ' has-quick-btn' : ''}`}
                        isConnectableStart={true}
                        isConnectableEnd={true}
                    >
                        {showQuickBtn && (
                            <div
                                className="flowchart-quick-clone-btn"
                                data-dir={dir}
                                title="单击: 快速添加 | 拖拽: 连线"
                                onPointerDown={(ev) => {
                                    const startX = ev.clientX;
                                    const startY = ev.clientY;
                                    const dirCapture = dir;
                                    const onUp = (ue: PointerEvent) => {
                                        document.removeEventListener('pointerup', onUp);
                                        const dx = Math.abs(ue.clientX - startX);
                                        const dy = Math.abs(ue.clientY - startY);
                                        if (dx < 5 && dy < 5) {
                                            handleQuickClone(dirCapture, ev as any);
                                        }
                                    };
                                    document.addEventListener('pointerup', onUp, { once: true });
                                }}
                            >
                                <Icon size={8} />
                            </div>
                        )}
                    </Handle>
                );
            })}
        </div>
    );
};

function areFlowchartNodePropsEqual(
    prev: NodeProps<Node<FlowchartNodeData>>,
    next: NodeProps<Node<FlowchartNodeData>>
) {
    if (prev.id !== next.id || prev.selected !== next.selected) return false;

    const pd = prev.data;
    const nd = next.data;
    if (pd === nd) return true;

    return (
        pd.label === nd.label &&
        pd.shape === nd.shape &&
        pd.domainClass === nd.domainClass &&
        pd.domain === nd.domain &&
        pd.isEditing === nd.isEditing &&
        pd.collapsed === nd.collapsed &&
        pd.locked === nd.locked &&
        pd.icon === nd.icon &&
        pd.description === nd.description &&
        pd.textAlign === nd.textAlign &&
        pd.businessKey === nd.businessKey &&
        pd.sequence === nd.sequence &&
        pd.themeColor === nd.themeColor &&
        pd.theme?.main === nd.theme?.main &&
        pd.theme?.border === nd.theme?.border &&
        pd.theme?.background === nd.theme?.background &&
        pd.theme?.text === nd.theme?.text &&
        pd.style?.shadow === nd.style?.shadow &&
        pd.style?.opacity === nd.style?.opacity &&
        pd.style?.borderStyle === nd.style?.borderStyle &&
        pd.style?.strokeDasharray === nd.style?.strokeDasharray &&
        pd.style?.gradient?.from === nd.style?.gradient?.from &&
        pd.style?.gradient?.to === nd.style?.gradient?.to &&
        pd.style?.gradient?.direction === nd.style?.gradient?.direction
    );
}

export default memo(FlowchartNode, areFlowchartNodePropsEqual);

export type { FlowchartShape, FlowchartNodeData } from './hooks/useFlowchartNodeStyleResolution';
