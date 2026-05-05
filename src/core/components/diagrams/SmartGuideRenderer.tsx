import React from 'react';
import { SmartGuide } from '../../hooks/useSmartGuides';
import { EdgeLabelRenderer } from '@xyflow/react';

interface SmartGuideRendererProps {
    guides: SmartGuide[];
}

/** 粉色参考线的基础样式 */
const GUIDE_COLOR = '#ff0071';
const GUIDE_LABEL_BG = 'rgba(255, 0, 113, 0.9)';

const labelStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: GUIDE_LABEL_BG,
    color: '#fff',
    padding: '1px 5px',
    borderRadius: 3,
    fontSize: 10,
    fontFamily: 'SF Mono, Menlo, monospace',
    fontWeight: 600,
    zIndex: 1002,
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 2px 8px rgba(255, 0, 113, 0.3)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    pointerEvents: 'none' as const,
};

export const SmartGuideRenderer: React.FC<SmartGuideRendererProps> = React.memo(({ guides }) => {
    if (guides.length === 0) return null;

    return (
        <EdgeLabelRenderer>
            <div
                key="smart-guide-renderer-container"
                style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 1000,
            }}>
                {guides.map((guide, index) => {
                    // ===== Spacing Guide（等距标注）=====
                    if (guide.type === 'spacing' && guide.spacingSegments) {
                        const isHorizontal = guide.spacingSegments[0]?.start !== undefined;
                        return (
                            <React.Fragment key={`spacing-${index}`}>
                                {guide.spacingSegments.map((seg, si) => {
                                    // 判断方向：如果第一段 start < position（Y 坐标），说明是垂直方向的 spacing
                                    // 简化：spacing guide 按 position 轴渲染
                                    const segLen = seg.end - seg.start;
                                    if (segLen <= 0) return null;

                                    // 检测是 X 方向间距还是 Y 方向间距
                                    // X 方向：segments 的 start/end 代表 X 坐标，position 代表 Y（中心高度）
                                    // Y 方向：segments 的 start/end 代表 Y 坐标，position 代表 X（中心宽度）
                                    const isXSpacing = seg.start > 100 || seg.end > 100; // heuristic — 改为看哪个轴

                                    return (
                                        <React.Fragment key={si}>
                                            {/* 间距线段 */}
                                            <div style={{
                                                position: 'absolute',
                                                backgroundColor: GUIDE_COLOR,
                                                opacity: 0.6,
                                                zIndex: 1001,
                                                left: seg.start,
                                                top: guide.position - 0.5,
                                                width: segLen,
                                                height: 1,
                                            }} />
                                            {/* 两端小竖线 */}
                                            <div style={{
                                                position: 'absolute',
                                                backgroundColor: GUIDE_COLOR,
                                                opacity: 0.6,
                                                zIndex: 1001,
                                                left: seg.start,
                                                top: guide.position - 4,
                                                width: 1,
                                                height: 8,
                                            }} />
                                            <div style={{
                                                position: 'absolute',
                                                backgroundColor: GUIDE_COLOR,
                                                opacity: 0.6,
                                                zIndex: 1001,
                                                left: seg.end,
                                                top: guide.position - 4,
                                                width: 1,
                                                height: 8,
                                            }} />
                                            {/* 间距数字 */}
                                            {seg.gap > 0 && segLen > 20 && (
                                                <div style={{
                                                    ...labelStyle,
                                                    left: (seg.start + seg.end) / 2,
                                                    top: guide.position,
                                                }}>
                                                    {seg.gap}
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </React.Fragment>
                        );
                    }

                    // ===== Alignment Guide（对齐参考线）=====
                    const style: React.CSSProperties = {
                        position: 'absolute',
                        backgroundColor: GUIDE_COLOR,
                        zIndex: 1000,
                        opacity: 0.8,
                    };

                    if (guide.type === 'horizontal') {
                        // 水平线：Y 位置固定，X 方向有范围
                        const hasExtent = guide.extent && isFinite(guide.extent.start) && isFinite(guide.extent.end);
                        style.transform = `translateY(${guide.position}px)`;
                        style.height = 1;
                        if (hasExtent) {
                            style.left = guide.extent!.start;
                            style.width = guide.extent!.end - guide.extent!.start;
                        } else {
                            style.left = 0;
                            style.width = '100%';
                        }
                    } else {
                        // 垂直线：X 位置固定，Y 方向有范围
                        const hasExtent = guide.extent && isFinite(guide.extent.start) && isFinite(guide.extent.end);
                        style.transform = `translateX(${guide.position}px)`;
                        style.width = 1;
                        if (hasExtent) {
                            style.top = guide.extent!.start;
                            style.height = guide.extent!.end - guide.extent!.start;
                        } else {
                            style.top = 0;
                            style.height = '100%';
                        }
                    }

                    return (
                        <React.Fragment key={index}>
                            <div style={style} />

                            {/* Gap Indicator */}
                            {guide.gap !== undefined && guide.gap > 0 && guide.gapStart !== undefined && guide.gapEnd !== undefined && (
                                <>
                                    <div style={{
                                        position: 'absolute',
                                        backgroundColor: GUIDE_COLOR,
                                        zIndex: 1001,
                                        ...(guide.type === 'vertical' ? {
                                            left: guide.position - 4,
                                            top: guide.gapStart,
                                            width: 9,
                                            height: guide.gapEnd - guide.gapStart,
                                        } : {
                                            left: guide.gapStart,
                                            top: guide.position - 4,
                                            width: guide.gapEnd - guide.gapStart,
                                            height: 9,
                                        })
                                    }} />

                                    <div style={{
                                        ...labelStyle,
                                        left: guide.type === 'vertical' ? guide.position : (guide.gapStart + guide.gapEnd) / 2,
                                        top: guide.type === 'horizontal' ? guide.position : (guide.gapStart + guide.gapEnd) / 2,
                                    }}>
                                        {guide.gap}
                                    </div>
                                </>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </EdgeLabelRenderer>
    );
});
