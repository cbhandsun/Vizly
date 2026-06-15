import React, { useCallback, useMemo, useState } from 'react';
import { Button, Modal, Segmented } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { coerceStandardDiagramImport, parseDiagramJson } from '@/core/utils/diagramJsonImport';
import { downloadFile } from '@/core/utils/downloadUtils';


const LazyMonacoEditor = React.lazy(() => import('../lazy/LazyMonacoEditor'));

export interface JsonEditorModalProps {
    visible: boolean;
    onClose: () => void;
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    reactFlowInstance: ReactFlowInstance<any, any>;
    /** 外部注入的初始 JSON 内容（可选，例如 AI 生成后直接注入） */
    initialContent?: string;
    diagramId?: string;
}

/**
 * JSON 编辑器模态框
 * 支持标准数据格式（可编辑）和 React Flow 内部格式（只读 Debug）
 */
export const JsonEditorModal: React.FC<JsonEditorModalProps> = ({
    visible,
    onClose,
    nodes,
    edges,
    setNodes,
    setEdges,
    reactFlowInstance,
    initialContent,
    diagramId,
}) => {
    const { t } = useTranslation();
    const [jsonContent, setJsonContent] = useState(initialContent || '');
    const [pureJsonContent, setPureJsonContent] = useState('');
    const [jsonFormatMode, setJsonFormatMode] = useState<'standard' | 'pure' | 'react-flow'>('standard');

    // 当外部 initialContent 变更时同步
    React.useEffect(() => {
        if (initialContent !== undefined) {
            setJsonContent(initialContent);
            setJsonFormatMode('standard');
        }
    }, [initialContent]);

    // 当首次打开且无初始内容时，自动转换当前画布数据并与已存在的 Diagram 数据壳合并（防止布局配置等丢失）
    React.useEffect(() => {
        if (visible) {
            import('./designerUtils').then(async ({ canvasToStandardData, canvasToPureStandardData }) => {
                const pureData = canvasToPureStandardData(nodes, edges, 'Flowchart Export');
                setPureJsonContent(JSON.stringify(pureData, null, 2));

                if (!initialContent) {
                    let fullData = canvasToStandardData(nodes, edges, 'Flowchart Export');
                    if (diagramId) {
                        try {
                            const { dataRegistry } = await import('@/data/DataRegistry');
                            const localSvc = dataRegistry.getDataService();
                            const existing = localSvc.getDiagram(diagramId);
                            if (existing) {
                                fullData = {
                                    ...existing,
                                    nodes: fullData.nodes,
                                    edges: fullData.edges,
                                    groups: fullData.groups
                                } as any;
                            }
                        } catch (e) {
                            console.warn('Failed to fetch existing diagram data to merge for JSON editor', e);
                        }
                    }
                    setJsonContent(JSON.stringify(fullData, null, 2));
                    setJsonFormatMode('standard');
                }
            });
        }
    }, [visible, diagramId, nodes, edges, initialContent]); // 仅在 visible 变化时触发

    const applyJsonContentToCanvas = async (contentToApply: string) => {
        try {
            const parsedData = parseDiagramJson(contentToApply);
            const data = coerceStandardDiagramImport(parsedData, {
                id: diagramId || `json-import-${Date.now()}`,
                title: 'Flowchart Export',
            });

            // 如果有 DiagramID 并且是在标准模式，把修改后的布局和元数据存回去并触发页面刷新（向后兼容布局修改生效）
            if (diagramId && jsonFormatMode === 'standard') {
                const { dataRegistry } = await import('@/data/DataRegistry');
                const localSvc = dataRegistry.getDataService();
                localSvc.registerRemoteDiagram({ ...data, id: diagramId }, {
                    id: diagramId,
                    title: data.name || data.metadata?.title || 'Flowchart Export',
                }, false, {
                    id: diagramId,
                });
                appMessage.success('配置已保存！重载视图以应用全部全量布局...');
                setTimeout(() => window.location.reload(), 500);
                return true;
            }

            // 否则退回到仅渲染画布更新
            const { standardDataToCanvas } = await import('./designerUtils');
            const { nodes: newNodes, edges: newEdges } = await standardDataToCanvas(data);

            if (newNodes.length > 0) {
                setNodes(newNodes);
                setEdges(newEdges);
                setTimeout(() => reactFlowInstance.fitView({ duration: 800, padding: 0.35, minZoom: 0.55 }), 50);
                appMessage.success(t('designer.flowchart.jsonApplied') || '应用成功');
                return true;
            }
            return false;
        } catch (e) {
            appMessage.error(t('designer.flowchart.invalidJson', { reason: (e as Error).message }));
            return false;
        }
    };

    const getActiveContent = useCallback(() => {
        return jsonFormatMode === 'pure' ? pureJsonContent : jsonContent;
    }, [jsonFormatMode, pureJsonContent, jsonContent]);

    const setActiveContent = useCallback((val: string) => {
        if (jsonFormatMode === 'pure') setPureJsonContent(val);
        else setJsonContent(val);
    }, [jsonFormatMode]);

    // Format Current JSON
    const handleFormat = useCallback(() => {
        try {
            const content = getActiveContent();
            const obj = parseDiagramJson(content || '{}');
            setActiveContent(JSON.stringify(obj, null, 2));
            appMessage.success(t('designer.flowchart.jsonFormatted') || 'JSON 格式化成功');
        } catch (e: unknown) {
            appMessage.error(t('designer.flowchart.invalidJson', { reason: (e as Error).message }));
        }
    }, [getActiveContent, setActiveContent, t]);

    // Download JSON
    const handleDownload = useCallback(() => {
        try {
            const content = getActiveContent();
            parseDiagramJson(content || '{}');
            const prefix = jsonFormatMode === 'standard' ? 'Diagram_Standard' : 
                           jsonFormatMode === 'pure' ? 'Diagram_Pure' : 'Diagram_ReactFlow';
            downloadFile(content, `${prefix}_${new Date().getTime()}.json`, 'application/json');
        } catch (e: unknown) {
            appMessage.error(t('designer.flowchart.invalidJson', { reason: (e as Error).message }));
        }
    }, [getActiveContent, jsonFormatMode, t]);

    // Preview/Apply without closing
    const handlePreviewApply = async () => {
        await applyJsonContentToCanvas(getActiveContent());
    };

    // Save and close
    const handleSave = async () => {
        const success = await applyJsonContentToCanvas(getActiveContent());
        if (success) {
            onClose();
        }
    };

    // Derived content based on format mode
    const editorDisplayContent = useMemo(() => {
        if (jsonFormatMode === 'standard') {
            return jsonContent;
        }
        if (jsonFormatMode === 'pure') {
            return pureJsonContent;
        }
        return JSON.stringify({ nodes, edges }, null, 2);
    }, [jsonFormatMode, jsonContent, pureJsonContent, nodes, edges]);

    if (!visible) return null;

    return (
        <Modal
            open={visible}
            title={t('designer.jsonEditor.title') || 'Diagram Data Viewer'}
            onCancel={onClose}
            getContainer={() => document.getElementById('app-root-layout') || document.body}
            width={850}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* 左侧功能区 */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                            onClick={handleFormat}
                            disabled={jsonFormatMode === 'react-flow'}
                        >
                            {t('designer.jsonEditor.format') || '格式化 JSON'}
                        </Button>
                        <Button
                            onClick={handleDownload}
                            icon={<UploadOutlined style={{ transform: 'rotate(180deg)' }} />}
                        >
                            {t('designer.jsonEditor.download') || '下载文件'}
                        </Button>
                    </div>
                    {/* 右侧保存区 */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="dashed"
                            onClick={handlePreviewApply}
                            disabled={jsonFormatMode === 'react-flow'}
                        >
                            {t('designer.jsonEditor.applyOnly') || '仅预览并应用'}
                        </Button>
                        <Button
                            type="primary"
                            onClick={handleSave}
                            disabled={jsonFormatMode === 'react-flow'}
                        >
                            {t('designer.jsonEditor.saveAndClose') || '应用修改并关闭'}
                        </Button>
                    </div>
                </div>
            }
            styles={{ body: { height: '60vh', marginTop: 12, display: 'flex', flexDirection: 'column' } }}
        >
            <div style={{ marginBottom: 16 }}>
                <Segmented
                    block
                    options={[
                        { label: t('designer.jsonEditor.formatStandard') || 'Standard Data (Editable)', value: 'standard' },
                        { label: t('designer.jsonEditor.formatPure') || 'Pure Data (Smart Layout)', value: 'pure' },
                        { label: t('designer.jsonEditor.formatReactFlow') || 'React Flow (Read-Only)', value: 'react-flow' }
                    ]}
                    value={jsonFormatMode}
                    onChange={(val) => setJsonFormatMode(val as 'standard' | 'pure' | 'react-flow')}
                />
            </div>
            {jsonFormatMode === 'react-flow' && (
                <div style={{ marginBottom: 12, color: '#faad14', backgroundColor: '#fffbe6', padding: '8px 12px', border: '1px solid #ffe58f', borderRadius: 6, fontSize: 13 }}>
                    {t('designer.jsonEditor.reactFlowWarning') || '当前处于 React Flow 内部渲染节点/边结构大纲预览（只读）。该模式仅供 Debug，不支持反向应用。如需修改架构，请切换到标准数据模式。'}
                </div>
            )}
            <React.Suspense fallback={<div>{t('common.loading')}</div>}>
                <div style={{ flex: 1, border: '1px solid #eee', borderRadius: 4, overflow: 'hidden' }}>
                    <LazyMonacoEditor
                        value={editorDisplayContent}
                        onChange={(val: string | undefined) => {
                            if (jsonFormatMode === 'standard') {
                                setJsonContent(val || '');
                            } else if (jsonFormatMode === 'pure') {
                                setPureJsonContent(val || '');
                            }
                        }}
                        language="json"
                        options={{
                            minimap: { enabled: false },
                            formatOnPaste: true,
                            readOnly: jsonFormatMode === 'react-flow'
                        }}
                    />
                </div>
            </React.Suspense>
        </Modal>
    );
};
