import React from 'react';
import { Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { NodeDataUpdate } from '../../types/diagram-updates';
import { FlowchartNodeData } from '../custom-nodes/FlowchartNode';
import {
    Input,
    InputNumber,
    Select,
    ColorPicker,
    Typography,
    Space,
    Radio,
    Form,
    Row,
    Col,
    Slider,
    Button,
    Switch
} from 'antd';
import {
    InfoCircleOutlined,
    LayoutOutlined,
    BgColorsOutlined,
    RadiusSettingOutlined,
    AppstoreOutlined,
    AlignLeftOutlined,
    AlignCenterOutlined,
    AlignRightOutlined,
} from '@ant-design/icons';
import { FaSearch } from 'react-icons/fa';
import { Clock } from 'lucide-react';
import type { Color } from 'antd/es/color-picker';
import type { CollapseProps } from 'antd';

import { ArrowTimelineEventsEditor } from './ArrowTimelineEventsEditor';
import { ArchitectureNodeEditor } from './ArchitectureNodeEditor';
import { AccessibleInputClearIcon } from './AccessibleInputClearIcon';
import { LocalizedInputNumber } from './LocalizedInputNumber';

const { Text } = Typography;
const { TextArea } = Input;

export interface UseNodePropertyItemsParams {
    selectedNodes: Node[];
    updateNodes: (partialData: NodeDataUpdate) => void;
    armSnapshot: () => void;
    disabled: boolean;
    mixedLabel: string;
    selectLabel: string;
    onColorChange: (color: Color, field: string) => void;
    localLabel: string;
    setLocalLabel: (v: string) => void;
    localDesc: string;
    setLocalDesc: (v: string) => void;
    localDomain: string;
    setLocalDomain: (v: string) => void;
    debouncedUpdateLabel: DebouncedUpdater;
    debouncedUpdateDesc: DebouncedUpdater;
    debouncedUpdateDomain: DebouncedUpdater;
    onShowIconExplorer?: () => void;
}

type DebouncedUpdater = ((value: string) => void) & { cancel?: () => void };
interface TimelineNodeData extends Record<string, unknown> {
    status?: string;
    date?: string;
    progress?: number;
    type?: string;
}

const getNodeData = (node: Node) => node.data as FlowchartNodeData;
const getTimelineNodeData = (node: Node) => node.data as TimelineNodeData;

/**
 * 节点属性编辑 items — 返回 Collapse items 数组
 */
export function useNodePropertyItems(params: UseNodePropertyItemsParams): CollapseProps['items'] {
    const { t } = useTranslation();
    const {
        selectedNodes, updateNodes, armSnapshot, disabled,
        mixedLabel, selectLabel, onColorChange,
        localLabel, setLocalLabel, localDesc, setLocalDesc,
        localDomain, setLocalDomain,
        debouncedUpdateLabel, debouncedUpdateDesc, debouncedUpdateDomain,
        onShowIconExplorer,
    } = params;

    const nodeCount = selectedNodes.length;
    const fieldIdPrefix = React.useId().replace(/:/g, '');
    const fieldIds = {
        label: `${fieldIdPrefix}-label`,
        description: `${fieldIdPrefix}-description`,
        width: `${fieldIdPrefix}-width`,
        height: `${fieldIdPrefix}-height`,
        domain: `${fieldIdPrefix}-domain`,
        domainClass: `${fieldIdPrefix}-domain-class`,
        sequence: `${fieldIdPrefix}-sequence`,
        shape: `${fieldIdPrefix}-shape`,
        icon: `${fieldIdPrefix}-icon`,
    };

    const getCommonValue = <T, V>(items: T[], getter: (item: T) => V): V | undefined => {
        if (items.length === 0) return undefined;
        const first = getter(items[0]);
        return items.every(item => getter(item) === first) ? first : undefined;
    };

    const commonDomain = getCommonValue(selectedNodes, (n) => getNodeData(n)?.domain);
    const commonDomainClass = getCommonValue(selectedNodes, (n) => getNodeData(n)?.domainClass);
    const commonSequence = getCommonValue(selectedNodes, (n) => getNodeData(n)?.sequence);
    const commonShape = getCommonValue(selectedNodes, (n) => getNodeData(n)?.shape);
    const commonThemeColor = getCommonValue(selectedNodes, (n) => getNodeData(n)?.themeColor);
    const commonNodeIcon = getCommonValue(selectedNodes, (n) => getNodeData(n)?.icon);
    const commonNodeMainColor = getCommonValue(selectedNodes, (n) => getNodeData(n)?.theme?.main);
    const commonNodeBgColor = getCommonValue(selectedNodes, (n) => getNodeData(n)?.theme?.background);
    const commonNodeTextColor = getCommonValue(selectedNodes, (n) => getNodeData(n)?.theme?.text);
    const commonNodeLabel = getCommonValue(selectedNodes, (n) => getNodeData(n)?.label);
    const commonNodeDesc = getCommonValue(selectedNodes, (n) => getNodeData(n)?.description);
    
    // Mind Map specific properties
    const commonPathStyle = getCommonValue(selectedNodes, (n) => getNodeData(n)?.pathStyle ?? 'bezier');
    const commonDirection = getCommonValue(selectedNodes, (n) => getNodeData(n)?.direction ?? 'LR');
    const commonBranchColor = getCommonValue(selectedNodes, (n) => getNodeData(n)?.branchColor);
    const commonHasBoundary = getCommonValue(selectedNodes, (n) => getNodeData(n)?.hasBoundary);
    const hasRootNode = selectedNodes.some(n => getNodeData(n)?.depth === 0);

    const commonWidth = getCommonValue(selectedNodes, (n) => n.style?.width ?? n.width ?? n.measured?.width);
    const commonHeight = getCommonValue(selectedNodes, (n) => n.style?.height ?? n.height ?? n.measured?.height);
    const commonBorderRadius = getCommonValue(selectedNodes, (n) => {
        const r = n.style?.borderRadius;
        return typeof r === 'number' ? r : (typeof r === 'string' ? parseInt(r) || 10 : 10);
    });
    const commonTextAlign = getCommonValue(selectedNodes, (n) => (n.data as FlowchartNodeData)?.textAlign ?? 'center');
    const commonNodeStrokeWidth = getCommonValue(selectedNodes, (n) => {
        const sw = n.style?.strokeWidth;
        return typeof sw === 'number' ? sw : 2;
    });
    const isDashed = (style: React.CSSProperties | undefined) => style?.strokeDasharray === '5 5' || style?.strokeDasharray === '4,4';
    const commonNodeBorderStyle = getCommonValue(selectedNodes, (n) => (isDashed(n.style) ? 'dashed' : 'solid'));

    const isAllNodes = selectedNodes.every(n => n.type !== 'titleGroup' && n.type !== 'subGroup' && n.type !== 'timelineNode' && n.type !== 'mindmap' && n.type !== 'architectureNode');
    const isAllGroups = selectedNodes.every(n => n.type === 'titleGroup' || n.type === 'subGroup');
    const isAllTimelineNodes = selectedNodes.every(n => n.type === 'timelineNode');
    const isAllMindmapNodes = selectedNodes.every(n => n.type === 'mindmap');
    const isAllArchitectureNodes = selectedNodes.every(n => n.type === 'architectureNode');
    const isMixedNodes = !isAllNodes && !isAllGroups && !isAllTimelineNodes && !isAllMindmapNodes && !isAllArchitectureNodes;

    const items: CollapseProps['items'] = [];

    // --- Info Panel ---
    items.push({
        key: 'info',
        label: <Space><InfoCircleOutlined />{t('propertyPanel.information')}</Space>,
        children: (
            <Form layout="vertical" size="small">
                <Form.Item label={t('propertyPanel.label')} htmlFor={fieldIds.label}>
                    <Input id={fieldIds.label} aria-label={t('propertyPanel.label')} value={localLabel}
                        onChange={e => { setLocalLabel(e.target.value); debouncedUpdateLabel(e.target.value); }}
                        onBlur={() => { debouncedUpdateLabel.cancel?.(); updateNodes({ label: localLabel }); }}
                        onFocus={armSnapshot}
                        placeholder={nodeCount > 1 && commonNodeLabel === undefined
                            ? mixedLabel
                            : t('propertyPanel.placeholders.label')}
                        allowClear={{
                            clearIcon: <AccessibleInputClearIcon label={t('propertyPanel.clearLabel')} />,
                        }}
                        disabled={disabled} />
                </Form.Item>
                <Form.Item label={t('propertyPanel.description')} htmlFor={fieldIds.description}>
                    <TextArea id={fieldIds.description} aria-label={t('propertyPanel.description')} value={localDesc}
                        onChange={e => { setLocalDesc(e.target.value); debouncedUpdateDesc(e.target.value); }}
                        onBlur={() => { debouncedUpdateDesc.cancel?.(); updateNodes({ description: localDesc }); }}
                        onFocus={armSnapshot} rows={2}
                        placeholder={nodeCount > 1 && commonNodeDesc === undefined
                            ? mixedLabel
                            : t('propertyPanel.placeholders.description')}
                        disabled={disabled} />
                </Form.Item>
            </Form>
        ),
    });

    // --- Layout Panel ---
    items.push({
        key: 'layout',
        label: <Space><LayoutOutlined />{t('propertyPanel.layout')}</Space>,
        children: (
            <Row gutter={8}>
                <Col span={12}>
                    <Form.Item label={t('propertyPanel.width')} htmlFor={fieldIds.width} style={{ marginBottom: 0 }}>
                        <LocalizedInputNumber id={fieldIds.width} aria-label={t('propertyPanel.width')} style={{ width: '100%' }} value={commonWidth}
                            increaseLabel={t('propertyPanel.increaseValue', { field: t('propertyPanel.width') })}
                            decreaseLabel={t('propertyPanel.decreaseValue', { field: t('propertyPanel.width') })}
                            onChange={val => updateNodes({ style: { width: typeof val === 'number' ? val : undefined } })}
                            onFocus={armSnapshot} placeholder={commonWidth === undefined ? mixedLabel : undefined} disabled={disabled} />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item label={t('propertyPanel.height')} htmlFor={fieldIds.height} style={{ marginBottom: 0 }}>
                        <LocalizedInputNumber id={fieldIds.height} aria-label={t('propertyPanel.height')} style={{ width: '100%' }} value={commonHeight}
                            increaseLabel={t('propertyPanel.increaseValue', { field: t('propertyPanel.height') })}
                            decreaseLabel={t('propertyPanel.decreaseValue', { field: t('propertyPanel.height') })}
                            onChange={val => updateNodes({ style: { height: typeof val === 'number' ? val : undefined } })}
                            onFocus={armSnapshot} placeholder={commonHeight === undefined ? mixedLabel : undefined} disabled={disabled} />
                    </Form.Item>
                </Col>
            </Row>
        ),
    });

    // --- Semantics + Appearance + Colors (for normal nodes) ---
    if (isAllNodes || isMixedNodes) {
        items.push({
            key: 'semantics',
            label: <Space><AppstoreOutlined />{t('propertyPanel.semantics')}</Space>,
            children: (
                <Form layout="vertical" size="small">
                    <Form.Item label={t('propertyPanel.domainName')} htmlFor={fieldIds.domain}>
                        <Input id={fieldIds.domain} aria-label={t('propertyPanel.domainName')} value={localDomain}
                            onChange={e => { setLocalDomain(e.target.value); debouncedUpdateDomain(e.target.value); }}
                            onBlur={() => { debouncedUpdateDomain.cancel?.(); updateNodes({ domain: localDomain }); }}
                            onFocus={armSnapshot}
                            placeholder={commonDomain === undefined
                                ? mixedLabel
                                : t('propertyPanel.placeholders.domain')}
                            allowClear disabled={disabled} />
                    </Form.Item>
                    <Form.Item label={t('propertyPanel.domainClass')} htmlFor={fieldIds.domainClass}>
                        <Select id={fieldIds.domainClass} aria-label={t('propertyPanel.domainClass')} value={commonDomainClass} onChange={val => updateNodes({ domainClass: val })}
                            onOpenChange={(open) => { if (open) armSnapshot(); }}
                            placeholder={commonDomainClass === undefined ? mixedLabel : selectLabel}
                            allowClear disabled={disabled}
                            options={[
                                { label: t('propertyPanel.options.domainClass.core'), value: 'core' },
                                { label: t('propertyPanel.options.domainClass.system'), value: 'system' },
                                { label: t('propertyPanel.options.domainClass.external'), value: 'external' },
                                { label: t('propertyPanel.options.domainClass.decision'), value: 'decision' },
                                { label: t('propertyPanel.options.domainClass.support'), value: 'support' }
                            ]} />
                    </Form.Item>
                    <Form.Item label={t('propertyPanel.sequence')} htmlFor={fieldIds.sequence}>
                        <InputNumber id={fieldIds.sequence} aria-label={t('propertyPanel.sequence')} style={{ width: '100%' }} value={commonSequence}
                            onChange={val => updateNodes({ sequence: typeof val === 'number' ? val : undefined })}
                            onFocus={armSnapshot}
                            placeholder={commonSequence === undefined ? mixedLabel : undefined}
                            disabled={disabled} />
                    </Form.Item>
                </Form>
            ),
        });

        items.push({
            key: 'appearance',
            label: <Space><RadiusSettingOutlined />{t('propertyPanel.appearance')}</Space>,
            children: (
                <Form layout="vertical" size="small">
                    <Form.Item label={t('propertyPanel.shape')} htmlFor={fieldIds.shape}>
                        <Select id={fieldIds.shape} aria-label={t('propertyPanel.shape')} value={commonShape} onChange={val => updateNodes({ shape: val })}
                            onOpenChange={(open) => { if (open) armSnapshot(); }}
                            placeholder={commonShape === undefined ? mixedLabel : selectLabel}
                            allowClear disabled={disabled}
                            options={[
                                { label: t('propertyPanel.options.shape.rectangle'), value: 'rectangle' },
                                { label: t('propertyPanel.options.shape.ellipse'), value: 'ellipse' },
                                { label: t('propertyPanel.options.shape.circle'), value: 'circle' },
                                { label: t('propertyPanel.options.shape.triangle'), value: 'triangle' },
                                { label: t('propertyPanel.options.shape.diamond'), value: 'diamond' },
                                { label: t('propertyPanel.options.shape.hexagon'), value: 'hexagon' },
                                { label: t('propertyPanel.options.shape.star'), value: 'star' },
   ����G����ƭy�,
                                    { label: t('propertyPanel.options.icon.thLarge'), value: 'th-large' },
                                    { label: t('propertyPanel.options.icon.image'), value: 'image' },
                                    { label: t('propertyPanel.options.icon.eye'), value: 'eye' },
                                    { label: t('propertyPanel.options.icon.keyboard'), value: 'keyboard' },
                                    { label: t('propertyPanel.options.icon.circle'), value: 'circle' },
                                    { label: t('propertyPanel.options.icon.star'), value: 'star' },
                                    { label: t('propertyPanel.options.icon.file'), value: 'file' },
                                    { label: t('propertyPanel.options.icon.cloud'), value: 'cloud' },
                                    { label: t('propertyPanel.options.icon.clock'), value: 'clock' },
                                    { label: t('propertyPanel.options.icon.desktop'), value: 'desktop' },
                                    { label: t('propertyPanel.options.icon.note'), value: 'note' },
                                    { label: t('propertyPanel.options.icon.hexagon'), value: 'hexagon' },
                                ]} 
                            />
                            <Button 
                                icon={<FaSearch />} 
                                onClick={onShowIconExplorer}
                                aria-label={t('iconExplorer.open', '浏览更多图标')}
                                title={t('iconExplorer.open', '浏览更多图标')}
                                disabled={disabled}
                            />
                        </Space.Compact>
                    </Form.Item>
                    <Form.Item label={t('propertyPanel.borderStyle')}>
                        <Radio.Group value={commonNodeBorderStyle}
                            onChange={e => { armSnapshot(); updateNodes({ style: { strokeDasharray: e.target.value === 'dashed' ? '4,4' : 'none' } }); }}
                            optionType="button" buttonStyle="solid" size="small" style={{ width: '100%' }} disabled={disabled}>
                            <Radio.Button value="solid" style={{ width: '50%', textAlign: 'center' }}>{t('propertyPanel.solid')}</Radio.Button>
                            <Radio.Button value="dashed" style={{ width: '50%', textAlign: 'center' }}>{t('propertyPanel.dashed')}</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                    <Form.Item label={t('propertyPanel.borderRadius')}>
                        <Slider min={0} max={50} value={commonBorderRadius ?? 10}
                            ariaLabelForHandle={t('propertyPanel.borderRadius')}
                            onChange={(val: number) => { armSnapshot(); updateNodes({ style: { borderRadius: val } }); }}
                            disabled={disabled} marks={{ 0: '0', 10: '10', 25: '25', 50: '50' }} />
                    </Form.Item>
                    <Form.Item label={t('propertyPanel.textAlign')}>
                        <Radio.Group value={commonTextAlign ?? 'center'}
                            onChange={e => { armSnapshot(); updateNodes({ data: { textAlign: e.target.value } }); }}
                            optionType="button" buttonStyle="solid" size="small" style={{ width: '100%' }} disabled={disabled}>
                            <Radio.Button aria-label={t('propertyPanel.alignLeft')} value="left" style={{ width: '33.3%', textAlign: 'center' }}><AlignLeftOutlined aria-hidden="true" /></Radio.Button>
                            <Radio.Button aria-label={t('propertyPanel.alignCenter')} value="center" style={{ width: '33.3%', textAlign: 'center' }}><AlignCenterOutlined aria-hidden="true" /></Radio.Button>
                            <Radio.Button aria-label={t('propertyPanel.alignRight')} value="right" style={{ width: '33.3%', textAlign: 'center' }}><AlignRightOutlined aria-hidden="true" /></Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                    <Form.Item label={t('propertyPanel.borderWidth')}>
                        <InputNumber style={{ width: '100%' }} value={commonNodeStrokeWidth ?? 2}
                            aria-label={t('propertyPanel.borderWidth')}
                            onChange={(val) => { armSnapshot(); updateNodes({ style: { strokeWidth: typeof val === 'number' ? val : 2 } }); }}
                            min={0} max={8} disabled={disabled} />
                    </Form.Item>
                </Form>
            ),
        });

        items.push({
            key: 'colors',
            label: <Space><BgColorsOutlined />{t('propertyPanel.colors')}</Space>,
            children: (
                <Row gutter={[8, 8]}>
                    <Col span={24}><div className="color-row"><Text style={{ fontSize: 12 }}>{t('propertyPanel.mainColor')}</Text><ColorPicker value={commonNodeMainColor ?? undefined} onChange={c => onColorChange(c, 'main')} showText disabled={disabled} /></div></Col>
                    <Col span={24}><div className="color-row"><Text style={{ fontSize: 12 }}>{t('propertyPanel.backgroundColor')}</Text><ColorPicker value={commonNodeBgColor ?? undefined} onChange={c => onColorChange(c, 'background')} showText disabled={disabled} /></div></Col>
                    <Col span={24}><div className="color-row"><Text style={{ fontSize: 12 }}>{t('propertyPanel.textColor')}</Text><ColorPicker value={commonNodeTextColor ?? undefined} onChange={c => onColorChange(c, 'text')} showText disabled={disabled} /></div></Col>
                </Row>
            ),
        });
    }

    // --- Group styling ---
    if (isAllGroups) {
        items.push({
            key: 'styling',
            label: <Space><BgColorsOutlined />{t('propertyPanel.styling')}</Space>,
            children: (
                <div className="color-row">
                    <Text style={{ fontSize: 12 }}>{t('propertyPanel.themeColor')}</Text>
                    <ColorPicker value={commonThemeColor ?? undefined} onChange={c => onColorChange(c, 'themeColor')} showText disabled={disabled} />
                </div>
            ),
        });
    }

    // --- Timeline specific properties ---
    if (isAllTimelineNodes) {
        const commonTimelineStatus = getCommonValue(selectedNodes, (n) => getTimelineNodeData(n).status);
        const commonTimelineDate = getCommonValue(selectedNodes, (n) => getTimelineNodeData(n).date);
        const commonTimelineProgress = getCommonValue(selectedNodes, (n) => getTimelineNodeData(n).progress);
        const hasPhase = selectedNodes.some(n => getTimelineNodeData(n).type === 'phase');

        items.push({
            key: 'timelineSettings',
            label: <Space><Clock size={14} strokeWidth={2} />时间线配置</Space>,
            children: (
                <Form layout="vertical" size="small">
                    <Form.Item label="日期/排期">
                        <Input value={commonTimelineDate as string}
                            onChange={e => updateNodes({ data: { date: e.target.value } })}
                            onFocus={armSnapshot}
                            placeholder={commonTimelineDate === undefined ? mixedLabel : undefined}
                            allowClear disabled={disabled} />
                    </Form.Item>
                    <Form.Item label="当前状态">
                        <Select value={commonTimelineStatus as string}
                            onChange={val => { armSnapshot(); updateNodes({ data: { status: val } }); }}
                            options={[
                                { label: '待开始 (Pending)', value: 'pending' },
                                { label: '进行中 (Active)', value: 'active' },
                                { label: '已完成 (Done)', value: 'done' }
                            ]}
                            disabled={disabled} />
                    </Form.Item>
                    {hasPhase && (
                        <Form.Item label="进度 (%)">
                            <Slider min={0} max={100} value={(commonTimelineProgress as number) ?? 0}
                                onChange={(val: number) => { armSnapshot(); updateNodes({ data: { progress: val } }); }}
                                disabled={disabled} marks={{ 0: '0', 50: '50', 100: '100' }} />
                        </Form.Item>
                    )}
                </Form>
            )
        });
    }

    // --- Arrow Timeline specific properties ---
    const isArrowTimelineNodes = selectedNodes.length > 0 && selectedNodes.every(n => n.type === 'arrowTimeline');
    if (isArrowTimelineNodes) {
        items.push({
            key: 'arrowTimelineSettings',
            label: <Space><Clock size={14} strokeWidth={2} />时间节点配置</Space>,
            children: (
                <ArrowTimelineEventsEditor
                    selectedNodes={selectedNodes}
                    updateNodes={updateNodes}
                    armSnapshot={armSnapshot}
                    disabled={disabled}
                />
            )
        });
    }

    // --- Mind Map specific properties ---
    if (isAllMindmapNodes) {
        items.push({
            key: 'mindmapSettings',
            label: <Space><AppstoreOutlined />导图样式与结构</Space>,
            children: (
                <Form layout="vertical" size="small">
                    {hasRootNode && (
                        <Form.Item label="结构方向 (Structure)">
                            <Radio.Group 
                                value={commonDirection as string} 
                                onChange={e => { armSnapshot(); updateNodes({ data: { direction: e.target.value } }); }}
                                disabled={disabled}
                                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                            >
                                <Radio.Button value="LR" style={{ textAlign: 'center' }}>左右平衡 (Balanced)</Radio.Button>
                                <Radio.Button value="R" style={{ textAlign: 'center' }}>向右伸展 (Right-Only)</Radio.Button>
                                <Radio.Button value="L" style={{ textAlign: 'center' }}>向左伸展 (Left-Only)</Radio.Button>
                            </Radio.Group>
                        </Form.Item>
                    )}
                    
                    <Form.Item label="连线风格 (Line Style)">
                        <Select 
                            value={commonPathStyle}
                            onChange={val => { armSnapshot(); updateNodes({ data: { pathStyle: val } }); }}
                            disabled={disabled}
                            options={[
                                { label: '曲线 (Bezier)', value: 'bezier' },
                                { label: '分步折线 (Step)', value: 'step' },
                                { label: '直线 (Straight)', value: 'straight' }
                            ]}
                        />
                    </Form.Item>

                    <Form.Item label="节点形状 (Node Shape)">
                        <Select 
                            value={commonShape}
                            onChange={(val: FlowchartNodeData['shape']) => {
                                armSnapshot();
                                updateNodes({ data: { shape: val } });
                            }}
                            placeholder={commonShape === undefined ? mixedLabel : selectLabel}
                            disabled={disabled}
                            allowClear
                            options={[
                                { label: '下划线 (Underline)', value: 'underline' },
                                { label: '胶囊框 (Pill)', value: 'pill' },
                                { label: '矩形框 (Box)', value: 'box' }
                            ]}
                        />
                    </Form.Item>

                    <Form.Item label="分支颜色 (Branch Color)">
                        <ColorPicker
                            disabled={disabled}
                            value={commonBranchColor as string}
                            onChangeComplete={(c) => {
                                const hex = c.toHexString();
                                armSnapshot();
                                updateNodes({ data: { branchColor: hex } });
                            }}
                            showText
                        />
                    </Form.Item>

                    <Form.Item label="包含框 (Boundary)" valuePropName="checked">
                        <Switch
                            checked={commonHasBoundary as boolean ?? false}
                            onChange={(checked) => {
                                armSnapshot();
                                updateNodes({ data: { hasBoundary: checked } });
                            }}
                            disabled={disabled}
                        />
                    </Form.Item>

                    {selectedNodes.length > 1 && (
                        <Form.Item label="逻辑总结 (Summary)">
                            <Button 
                                type="dashed" 
                                block 
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('editor:add-summary-node', {
                                        detail: { sourceIds: selectedNodes.map(n => n.id) }
                                    }));
                                }}
                            >
                                添加总结节点
                            </Button>
                        </Form.Item>
                    )}
                </Form>
            )
        });
    }

    // --- Architecture specific properties ---
    if (isAllArchitectureNodes) {
        items.push({
            key: 'architectureSettings',
            label: <Space><AppstoreOutlined />云资源配置</Space>,
            children: (
                <ArchitectureNodeEditor
                    selectedNodes={selectedNodes}
                    updateNodes={updateNodes}
                    armSnapshot={armSnapshot}
                    onShowIconExplorer={(_onSelect) => {
                        // For simplicity, we trigger the shared explorer.
                        // If we needed specific logic, we'd pass it through.
                        // But since onShowIconExplorer in params takes no args,
                        // we just call it.
                        onShowIconExplorer?.();
                    }}
                    disabled={disabled}
                />
            )
        });
    }

    return items;
}
