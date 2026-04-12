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
    Radio,
    Form,
} from 'antd';
import {
    ShareAltOutlined,
    LineOutlined,
} from '@ant-design/icons';
import type { Color } from 'antd/es/color-picker';
import type { CollapseProps } from 'antd';

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
    debouncedUpdateEdgeLabel: (value: string) => void;
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
    const commonEdgeWidth = getCommonValue(selectedEdges, (e) => e.style?.strokeWidth);
    const isDashed = (style: React.CSSProperties | undefined) => style?.strokeDasharray === '5 5' || style?.strokeDasharray === '4,4';
    const commonEdgeLineStyle = getCommonValue(selectedEdges, (e) => (isDashed(e.style) ? 'dashed' : 'solid'));
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
                        onChange={e => { setLocalEdgeLabel(e.target.value); debouncedUpdateEdgeLabel(e.target.value); }}
                        onBlur={() => { (debouncedUpdateEdgeLabel as any).cancel?.(); updateEdges({ label: localEdgeLabel, data: { label: localEdgeLabel } }); }}
                        onFocus={armSnapshot}
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
                    <Select value={commonEdgeType} onChange={val => updateEdges({ type: val })}
                        onDropdownVisibleChange={(open) => { if (open) armSnapshot(); }}
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
                            onChange={(val) => { armSnapshot(); updateEdges({ data: { borderRadius: typeof val === 'number' ? val : undefined } }); }}
                            placeholder={commonEdgeRadius === undefined ? mixedLabel : undefined}
                            min={0} max={100} disabled={disabled} />
                    </Form.Item>
                )}

                <Form.Item label={t('propertyPanel.style')}>
                    <Radio.Group value={commonEdgeLineStyle}
                        onChange={e => { armSnapshot(); updateEdges({ style: { strokeDasharray: e.target.value === 'dashed' ? '5 5' : undefined } }); }}
                        optionType="button" buttonStyle="solid" size="small" style={{ width: '100%' }} disabled={disabled}>
                        <Radio.Button value="solid" style={{ width: '50%', textAlign: 'center' }}>{t('propertyPanel.solid')}</Radio.Button>
                        <Radio.Button value="dashed" style={{ width: '50%', textAlign: 'center' }}>{t('propertyPanel.dashed')}</Radio.Button>
                    </Radio.Group>
                </Form.Item>

                <Form.Item label={t('propertyPanel.color')}>
                    <div className="color-row">
                        <Text style={{ fontSize: 12 }}>{t('propertyPanel.strokeColor')}</Text>
                        <ColorPicker value={commonEdgeColor ?? undefined} onChange={c => onColorChange(c, 'stroke')} showText disabled={disabled} />
                    </div>
                </Form.Item>

                <Form.Item label={t('propertyPanel.lineWidth')}>
                    <InputNumber style={{ width: '100%' }} value={commonEdgeWidth}
                        onChange={(val) => { armSnapshot(); updateEdges({ style: { strokeWidth: typeof val === 'number' ? val : undefined } }); }}
                        placeholder={commonEdgeWidth === undefined ? mixedLabel : undefined}
                        min={1} max={16} disabled={disabled} />
                </Form.Item>

                <Form.Item label={t('propertyPanel.arrowHead')}>
                    <Select value={commonEdgeArrow}
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
