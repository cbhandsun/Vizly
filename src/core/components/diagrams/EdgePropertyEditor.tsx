import React from 'react';
import { Edge, MarkerType } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { EdgeDataUpdate } from '../../types/diagram-updates';
import {
    Input,
    InputNumber,
    Select,
    ColorPicker,
    Typography,
    Space,
    Form,
} from 'antd';
import {
    ShareAltOutlined,
    LineOutlined,
} from '@ant-design/icons';
import type { Color } from 'antd/es/color-picker';
import type { CollapseProps } from 'antd';
import {
    coerceFlowchartReplaceText,
    FLOWCHART_REPLACE_TEXT_MAX_LENGTH,
} from './flowchartSearchReplace';
import { coerceEdgePropertyStrokeWidth } from './edgePropertyBoundary';

const { Text } = Typography;

export interface UseEdgePropertyItemsParams {
    selectedEdges: Edge[];
    updateEdges: (partialData: EdgeDataUpdate) => void;
    armSnapshot: () => void;
    disabled: boolean;
    mixedLabel: string;
    selectLabel: string;
    localEdgeLabel: string;
    setLocalEdgeLabel: (v: string) => void;
    debouncedUpdateEdgeLabel: ((value: string) => void) & { cancel?: () => void };
    onColorChange: (color: Color, field: string) => void;
}

const getArrowStyle = (edge: Edge): string => {
    const me = edge.markerEnd;
    const ms = edge.markerStart;
    if (!!ms && !!me) return 'bidirectional';
    if (!me) return 'none';
    if (typeof me === 'object' && me.type === MarkerType.Arrow) return 'open-arrow';
    return 'arrow';
};

/**
 * 边属性编辑 items — 返回 Collapse items 数组
 */
export function useEdgePropertyItems(params: UseEdgePropertyItemsParams): CollapseProps['items'] {
    const { t } = useTranslation();
    const {
        selectedEdges, updateEdges, armSnapshot, disabled,
        mixedLabel, selectLabel,
        localEdgeLabel, setLocalEdgeLabel, debouncedUpdateEdgeLabel,
        onColorChange,
    } = params;

    const edgeCount = selectedEdges.length;

    const getCommonValue = <T, V>(items: T[], getter: (item: T) => V): V | undefined => {
        if (items.length === 0) return undefined;
        const first = getter(items[0]);
        return items.every(item => getter(item) === first) ? first : undefined;
    };

    const commonEdgeLabel = getCommonValue(selectedEdges, (e) => e.data?.label || e.label);
    const commonEdgeType = getCommonValue(selectedEdges, (e) => e.type);
    const commonEdgeRadius = getCommonValue(selectedEdges, (e) => e.data?.borderRadius as number | undefined);
    const commonEdgeColor = getCommonValue(selectedEdges, (e) => e.style?.stroke);
    const commonEdgeColorText = typeof commonEdgeColor === 'string' ? commonEdgeColor : selectLabel;
    const commonEdgeWidth = getCommonValue(
        selectedEdges,
        (e) => coerceEdgePropertyStrokeWidth(e.style?.strokeWidth),
    );
    const getDashStyle = (style: React.CSSProperties | undefined): string => {
        const d = style?.strokeDasharray;
        if (!d || d === 'none') return 'solid';
        if (d === '2 4' || d === '2,4') return 'dotted';
        if (d === '12 4' || d === '12,4') return 'long-dash';
        if (d === '8 4 2 4' || d === '8,4,2,4') return 'dash-dot';
        return 'dashed'; // default 5 5
    };
    const commonEdgeLineStyle = getCommonValue(selectedEdges, (e) => getDashStyle(e.style));
    const commonEdgeArrow = getCommonValue(selectedEdges, (e) => getArrowStyle(e));

    const items: CollapseProps['items'] = [];

    // --- Connection Panel ---
    items.push({
        key: 'connection',
        label: <Space><ShareAltOutlined />{t('propertyPanel.connection')}</Space>,
        children: (
            <Form layout="vertical" size="small">
                <Form.Item label={t('propertyPanel.label')}>
                    <Input value={localEdgeLabel}
                        aria-label={t('propertyPanel.label')}
                        onChange={e => {
                            const nextLabel = coerceFlowchartReplaceText(e.target.value);
                            setLocalEdgeLabel(nextLabel);
                            debouncedUpdateEdgeLabel(nextLabel);
                        }}
                        onBlur={() => { debouncedUpdateEdgeLabel.cancel?.(); updateEdges({ label: localEdgeLabel, data: { label: localEdgeLabel } }); }}
                        onFocus={armSnapshot}
                        maxLength={FLOWCHART_REPLACE_TEXT_MAX_LENGTH}
                        placeholder={edgeCount > 1 && commonEdgeLabel === undefined ? mixedLabel : selectLabel}
                        allowClear disabled={disabled} />
                </Form.Item>
            </Form>
        ),
    });

    // --- Line Style Panel ---
    items.push({
        key: 'lineStyle',
        label: <Space><LineOutlined />{t('propertyPanel.lineStyle')}</Space>,
        children: (
            <Form layout="vertical" size="small">
                <Form.Item label={t('propertyPanel.lineType')}>
                    <Select aria-label={t('propertyPanel.lineType')}
                        value={commonEdgeType} onChange={val => updateEdges({ type: val })}
                        onOpenChange={(open) => { if (open) armSnapshot(); }}
                        placeholder={commonEdgeType === undefined ? mixedLabel : selectLabel}
                        allowClear disabled={disabled}
                        options={[
                            { label: t('propertyPanel.options.edgeType.smartOrthogonal', 'Smart Orthogonal'), value: 'smart-orthogonal' },
                            { label: t('propertyPanel.options.edgeType.smartStep'), value: 'smart-step' },
                            { label: t('propertyPanel.options.edgeType.smartBezier'), value: 'smart-bezier' },
                            { label: t('propertyPanel.options.edgeType.smartStraight'), value: 'smart-straight' },
                            { label: t('propertyPanel.options.edgeType.step'), value: 'step' },
                            { label: t('propertyPanel.options.edgeType.bezier'), value: 'bezier' },
                            { label: t('propertyPanel.options.edgeType.straight'), value: 'straight' },
                            { label: t('propertyPanel.options.edgeType.editable'), value: 'editable' }
                        ]} />
                </Form.Item>

                {commonEdgeType === 'smart-orthogonal' && (
                    <Form.Item label={t('propertyPanel.cornerRadius', 'Corner Radius')}>
                        <InputNumber style={{ width: '100%' }} value={commonEdgeRadius}
                            aria-label={t('propertyPanel.cornerRadius', 'Corner Radius')}
                            onChange={(val) => { armSnapshot(); updateEdges({ data: { borderRadius: typeof val === 'number' ? val : undefined } }); }}
                            placeholder={commonEdgeRadius === undefined ? mixedLabel : undefined}
                            min={0} max={100} disabled={disabled} />
                    </Form.Item>
                )}

                <Form.Item label={t('propertyPanel.style', '线型')}>
                    <Select
                        aria-label={t('propertyPanel.style', '线型')}
                        value={commonEdgeLineStyle}
                        onChange={val => {
                            armSnapshot();
                            const dashMap: Record<string, string | undefined> = {
                                'solid': undefined,
                                'dashed': '5 5',
                                'dotted': '2 4',
                                'long-dash': '12 4',
                                'dash-dot': '8 4 2 4',
                            };
                            updateEdges({ style: { strokeDasharray: dashMap[val] } });
                        }}
                        disabled={disabled}
                        style={{ width: '100%' }}
                        placeholder={commonEdgeLineStyle === undefined ? mixedLabel : selectLabel}
                        options={[
                            { label: '─── 实线', value: 'solid' },
                            { label: '- - - 虚线', value: 'dashed' },
                            { label: '···· 点线', value: 'dotted' },
                            { label: '――― 长虚线', value: 'long-dash' },
                            { label: '—·— 点划线', value: 'dash-dot' },
                        ]}
                    />
                </Form.Item>

                <Form.Item label={t('propertyPanel.color')}>
                    <div className="color-row">
                        <Text style={{ fontSize: 12 }}>{t('propertyPanel.strokeColor')}</Text>
                        <ColorPicker value={commonEdgeColor ?? undefined}
                            onChange={c => onColorChange(c, 'stroke')} disabled={disabled}>
                            <button
                                type="button"
                                className="edge-color-picker-trigger"
                                aria-label={t('propertyPanel.strokeColor')}
                                disabled={disabled}
                            >
                                <span
                                    className="edge-color-picker-swatch"
                                    style={{ backgroundColor: typeof commonEdgeColor === 'string' ? commonEdgeColor : 'transparent' }}
                                    aria-hidden="true"
                                />
                                <span>{commonEdgeColorText}</span>
                            </button>
                        </ColorPicker>
                    </div>
                </Form.Item>

                <Form.Item label={t('propertyPanel.lineWidth')}>
                    <InputNumber style={{ width: '100%' }} value={commonEdgeWidth}
                        aria-label={t('propertyPanel.lineWidth')}
                        onChange={(val) => { armSnapshot(); updateEdges({ style: { strokeWidth: typeof val === 'number' ? val : undefined } }); }}
                        placeholder={commonEdgeWidth === undefined ? mixedLabel : undefined}
                        min={1} max={16} disabled={disabled} />
                </Form.Item>

                <Form.Item label={t('propertyPanel.arrowHead')}>
                    <Select aria-label={t('propertyPanel.arrowHead')}
                        value={commonEdgeArrow}
                        onChange={val => {
                            armSnapshot();
                            const commonColor = commonEdgeColor ?? '#555';
                            switch (val) {
                                case 'none': updateEdges({ markerEnd: undefined, markerStart: undefined }); break;
                                case 'arrow': updateEdges({ markerEnd: { type: MarkerType.ArrowClosed, color: commonColor }, markerStart: undefined }); break;
                                case 'open-arrow': updateEdges({ markerEnd: { type: MarkerType.Arrow, color: commonColor }, markerStart: undefined }); break;
                                case 'bidirectional': updateEdges({ markerEnd: { type: MarkerType.ArrowClosed, color: commonColor }, markerStart: { type: MarkerType.ArrowClosed, color: commonColor } }); break;
                            }
                        }}
                        placeholder={commonEdgeArrow === undefined ? mixedLabel : selectLabel}
                        disabled={disabled} style={{ width: '100%' }}
                        options={[
                            { label: t('propertyPanel.options.arrowStyle.none'), value: 'none' },
                            { label: t('propertyPanel.options.arrowStyle.arrow'), value: 'arrow' },
                            { label: t('propertyPanel.options.arrowStyle.openArrow'), value: 'open-arrow' },
                            { label: t('propertyPanel.options.arrowStyle.bidirectional'), value: 'bidirectional' },
                        ]} />
                </Form.Item>
            </Form>
        ),
    });

    return items;
}
