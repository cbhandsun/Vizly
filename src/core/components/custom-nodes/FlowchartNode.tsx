import React, { memo } from 'react';
import { Handle, Position, NodeProps, NodeResizer, Node, useStore } from '@xyflow/react';
import { FlowchartNodeGraphics } from './renderers/FlowchartNodeGraphics';
import { useFlowchartNodeInteractions } from './hooks/useFlowchartNodeInteractions';
import { useFlowchartNodeStyleResolution } from './hooks/useFlowchartNodeStyleResolution';
import { EditableLabel } from '../diagrams/EditableLabel';
import type { FlowchartNodeData } from './hooks/useFlowchartNodeStyleResolution';
import { FaChevronUp, FaChevronRight, FaChevronDown, FaChevronLeft } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { sanitizeInlineHtml } from '../../utils/sanitizeHtml';
import './FlowchartNode.css';

export type FlowchartNodeProps = NodeProps<Node<FlowchartNodeData>>;

const FlowchartNode = ({ data, selected, id }: FlowchartNodeProps) => {
    const { t } = useTranslation();
    const _isConnecting = useStore((s) => s.connection.inProgress);
    const nodeData = useStore(s => s.nodeLookup.get(id));

    const nodeWidth = nodeData?.measured?.width || nodeData?.width || 150;
    const nodeHeight = nodeData?.measured?.height || nodeData?.height || 80;

    const {
        isHovered,
        setIsHovered,
        bounceAnimate,
        contentRef,
        editStartRef,
        handleUpdateData,
        handleQuickClone
    } = useFlowchartNodeInteractions(id as string, data, selected);

    const {
        preset,
        shape,
        computedRadius,
        mainColor,
        finalBorderColor,
        finalBgColor,
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
            aria-label={t('designer.flowchart.nodeAriaLabel', {
                label: data.label || id,
                selectedState: selected ? t('designer.flowchart.nodeSelectedState') : '',
                lockedState: data.locked ? t('designer.flowchart.nodeLockedState') : '',
            })}
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
                shape={shape}
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
                    const safeContentHtml = sanitizeInlineHtml(raw);

                    if (data.isEditing) {
                        return (
                            <EditableLabel
                                value={safeContentHtml}
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

                    const safeContentLines = safeContentHtml.includes('<br')
                        ? safeContentHtml.split(/<br\s*\/?>/i)
                        : safeContentHtml.split('\n');
                    const safeTitleLineHtml = safeContentLines[0]?.trim() || '';
                    const safeBodyLinesHtml = safeContentLines.slice(1).filter((line: string) => line.trim());

                    return (
                        <div
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleUpdateData({ isEditing: true });
                            }}
                            style={{ cursor: 'text', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', textAlign: data.textAlign || 'center' }}
                            title={t('designer.flowchart.doubleClickToEdit')}
                        >
                            {safeTitleLineHtml && (
                                <div className="flowchart-node-title">
                                    <span dangerouslySetInnerHTML={{ __html: safeTitleLineHtml }} style={{ pointerEvents: 'none' }} />
                                </div>
                            )}
                            {safeBodyLinesHtml.length > 0 && (
                                <div className="flowchart-node-body">
                                    {safeBodyLinesHtml.map((safeLineHtml: string, i: number) => (
                                        <div key={i} className="flowchart-node-body-line" dangerouslySetInnerHTML={{ __html: safeLineHtml }} style={{ pointerEvents: 'none' }} />
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
                const shortIdMap = { top: 't', right: 'r', bottom: 'b', left: 'l' } as const;
                const Icon = IconMap[dir];
                const showQuickBtn = (isHovered || selected) && !data.locked;
                return (
                    <React.Fragment key={dir}>
                        <Handle
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
                                    title={t('designer.flowchart.quickAddOrConnect')}
                                    onPointerDown={(ev) => {
                                        const startX = ev.clientX;
                                        const startY = ev.clientY;
                                        const dirCapture = dir;
                                        const onUp = (ue: PointerEvent) => {
                                            document.removeEventListener('pointerup', onUp);
                                            const dx = Math.abs(ue.clientX - startX);
                                            const dy = Math.abs(ue.clientY - startY);
                                            if (dx < 5 && dy < 5) {
                                                handleQuickClone(dirCapture, ue);
                                            }
                                        };
                                        document.addEventListener('pointerup', onUp, { once: true });
                                    }}
                                >
                                    <Icon size={8} />
                                </div>
                            )}
                        </Handle>
                        <Handle
                            type="source"
                            position={posMap[dir]}
                            id={shortIdMap[dir]}
                            className="flowchart-handle flowchart-handle-bidirectional flowchart-handle-alias"
                            isConnectableStart={true}
                            isConnectableEnd={true}
                        />
                        <Handle
                            type="target"
                            position={posMap[dir]}
                            id={dir}
                            className="flowchart-handle flowchart-handle-bidirectional flowchart-handle-target-shadow"
                            isConnectableStart={false}
                            isConnectableEnd={true}
                            style={{ opacity: 0, pointerEvents: 'none' }}
                        />
                        <Handle
                            type="target"
                            position={posMap[dir]}
                            id={shortIdMap[dir]}
                            className="flowchart-handle flowchart-handle-bidirectional flowchart-handle-alias flowchart-handle-target-shadow"
                            isConnectableStart={false}
                            isConnectableEnd={true}
                            style={{ opacity: 0, pointerEvents: 'none' }}
                        />
                    </React.Fragment>
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
