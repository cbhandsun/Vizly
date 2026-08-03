import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Modal, Segmented } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { coerceStandardDiagramImport, parseDiagramJson } from '@/core/utils/diagramJsonImport';
import { downloadFile } from '@/core/utils/downloadUtils';
import { logJsonEditorExistingDiagramMergeFailure } from './diagramImportLogging';
import { getJsonValidationReasonKey } from './jsonEditorValidation';
import { getApplicationDiagramRuntime } from '../../ports/applicationDiagramRuntime';
import LazyMonacoEditor from '../lazy/LazyMonacoEditor';
import type { LazyMonacoEditorMode } from '../lazy/LazyMonacoEditor';
import './JsonEditorModal.css';

export interface JsonEditorModalProps {
    visible: boolean;
    onClose: () => void;
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    reactFlowInstance: Pick<ReactFlowInstance<Node, Edge>, 'fitView'>;
    /** 外部注入的初始 JSON 内容（可选，例如 AI 生成后直接注入） */
    initialContent?: string;
    diagramId?: string;
    onBeforeCanvasReplace?: () => void;
}

type JsonApplyMode = 'canvas-only' | 'persist';

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
    onBeforeCanvasReplace,
}) => {
    const { t } = useTranslation();
    const [jsonContent, setJsonContent] = useState(initialContent || '');
    const [pureJsonContent, setPureJsonContent] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [jsonFormatMode, setJsonFormatMode] = useState<'standard' | 'pure' | 'react-flow'>('standard');
    const [editorMode, setEditorMode] = useState<LazyMonacoEditorMode>('loading');
    const [editorVisible, setEditorVisible] = useState(visible);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    if (editorVisible !== visible) {
        setEditorVisible(visible);
        if (visible) {
            setEditorMode('loading');
            setValidationError(null);
            setHasUnsavedChanges(false);
        }
    }
    const [loadedInitialContent, setLoadedInitialContent] = useState(initialContent);
    if (loadedInitialContent !== initialContent) {
        setLoadedInitialContent(initialContent);
        if (initialContent !== undefined) {
            setJsonContent(initialContent);
            setJsonFormatMode('standard');
        }
    }

    const showValidationError = useCallback((error: unknown) => {
        const reasonKey = getJsonValidationReasonKey(error);
        const reason = t(reasonKey);
        const message = t('designer.flowchart.invalidJson', { reason });
        setValidationError(message);
        appMessage.error(message);
    }, [t]);

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
                            const existing = await getApplicationDiagramRuntime().loadDiagram(diagramId);
                            if (existing) {
                                fullData = {
                                    ...existing,
                                    nodes: fullData.nodes,
                                    edges: fullData.edges,
                                    groups: fullData.groups
                                } as typeof fullData;
                            }
                        } catch (e) {
                            logJsonEditorExistingDiagramMergeFailure(e);
                        }
                    }
                    setJsonContent(JSON.stringify(fullData, null, 2));
                    setJsonFormatMode('standard');
                }
            });
        }
    }, [visible, diagramId, nodes, edges, initialContent]); // 仅在 visible 变化时触发

    const applyJsonContentToCanvas = async (contentToApply: string, applyMode: JsonApplyMode) => {
        try {
            setValidationError(null);
            const parsedData = parseDiagramJson(contentToApply);
            const data = coerceStandardDiagramImport(parsedData, {
                id: diagramId || `json-import-${Date.now()}`,
                title: 'Flowchart Export',
            });

            // 只有明确的“应用并关闭”操作可以进入持久化与重载路径。
            if (applyMode === 'persist' && diagramId && jsonFormatMode === 'standard') {
                await getApplicationDiagramRuntime().registerDiagram({ ...data, id: diagramId }, {
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

            onBeforeCanvasReplace?.();
            setNodes(newNodes);
            setEdges(newEdges);
            if (newNodes.length > 0) {
                setTimeout(() => reactFlowInstance.fitView({ duration: 800, padding: 0.35, minZoom: 0.55 }), 50);
            }
            appMessage.success(t('designer.flowchart.jsonApplied') || '应用成功');
            return true;
        } catch (e) {
            showValidationError(e);
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
            setHasUnsavedChanges(true);
            appMessage.success(t('designer.flowchart.jsonFormatted') || 'JSON 格式化成功');
        } catch (e: unknown) {
            showValidationError(e);
        }
    }, [getActiveContent, setActiveContent, showValidationError, t]);

    // Download JSON
    const handleDownload = useCallback(() => {
        try {
            const content = getActiveContent();
            parseDiagramJson(content || '{}');
            const prefix = jsonFormatMode === 'standard' ? 'Diagram_Standard' : 
                           jsonFormatMode === 'pure' ? 'Diagram_Pure' : 'Diagram_ReactFlow';
            downloadFile(content, `${prefix}_${new Date().getTime()}.json`, 'application/json');
        } catch (e: unknown) {
            showValidationError(e);
        }
    }, [getActiveContent, jsonFormatMode, showValidationError]);

    // Apply to the current canvas without closing or entering the persistence/reload path.
    const handleApplyWithoutClosing = async () => {
        const success = await applyJsonContentToCanvas(getActiveContent(), 'canvas-only');
        if (success) setHasUnsavedChanges(false);
    };

    // Save and close
    const handleSave = async () => {
        const success = await applyJsonContentToCanvas(getActiveContent(), 'persist');
        if (success) {
            setHasUnsavedChanges(false);
            onClose();
        }
    };

    const requestClose = useCallback(() => {
        if (!hasUnsavedChanges) {
            onClose();
            return;
        }
        appModal.confirm({
            zIndex: 2200,
            title: t('designer.jsonEditor.discardTitle'),
            content: t('designer.jsonEditor.discardContent'),
            okText: t('designer.jsonEditor.discardConfirm'),
            cancelText: t('designer.jsonEditor.keepEditing'),
            okButtonProps: { danger: true },
            onOk: () => {
                setHasUnsavedChanges(false);
                onClose();
            },
        });
    }, [hasUnsavedChanges, onClose, t]);

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
    const editorIsLoading = editorMode === 'loading';

    if (!visible) return null;

    return (
        <Modal
            open={visible}
            rootClassName="json-editor-modal"
            title={t('designer.jsonEditor.title') || 'Diagram Data Viewer'}
            onCancel={requestClose}
            getContainer={() => document.getElementById('app-root-layout') || document.body}
            width={850}
            zIndex={2100}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* 左侧功能区 */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                            onClick={handleFormat}
                            disabled={editorIsLoading || jsonFormatMode === 'react-flow'}
                        >
                            {t('designer.jsonEditor.format') || '格式化 JSON'}
                        </Button>
                        <Button
                            onClick={handleDownload}
                            disabled={editorIsLoading}
                            icon={<UploadOutlined style={{ transform: 'rotate(180deg)' }} />}
                        >
                            {t('designer.jsonEditor.download') || '下载文件'}
                        </Button>
                    </div>
                    {/* 右侧保存区 */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button onClick={requestClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="dashed"
                            onClick={handleApplyWithoutClosing}
                            disabled={editorIsLoading || jsonFormatMode === 'react-flow'}
                        >
                            {t('designer.jsonEditor.applyOnly') || '应用但不关闭'}
                        </Button>
                        <Button
                            type="primary"
                            onClick={handleSave}
                            disabled={editorIsLoading || jsonFormatMode === 'react-flow'}
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
                    onChange={(val) => {
                        setValidationError(null);
                        setJsonFormatMode(val as 'standard' | 'pure' | 'react-flow');
                    }}
                />
            </div>
            {jsonFormatMode === 'react-flow' && (
                <div style={{ marginBottom: 12, color: '#faad14', backgroundColor: '#fffbe6', padding: '8px 12px', border: '1px solid #ffe58f', borderRadius: 6, fontSize: 13 }}>
                    {t('designer.jsonEditor.reactFlowWarning') || '当前处于 React Flow 内部渲染节点/边结构大纲预览（只读）。该模式仅供 Debug，不支持反向应用。如需修改架构，请切换到标准数据模式。'}
                </div>
            )}
            {validationError && (
                <Alert
                    id="json-editor-validation-error"
                    className="json-editor-modal__validation"
                    type="error"
                    showIcon
                    title={validationError}
                    role="alert"
                />
            )}
            <div style={{ flex: 1, border: '1px solid #eee', borderRadius: 4, overflow: 'hidden' }}>
                <LazyMonacoEditor
                        onModeChange={setEditorMode}
                        value={editorDisplayContent}
                        onChange={(val: string | undefined) => {
                            setValidationError(null);
                            setHasUnsavedChanges(true);
                            if (jsonFormatMode === 'standard') {
                                setJsonContent(val || '');
                            } else if (jsonFormatMode === 'pure') {
                                setPureJsonContent(val || '');
                            }
                        }}
                        language="json"
                        ariaInvalid={Boolean(validationError)}
                        ariaDescribedBy={validationError ? 'json-editor-validation-error' : undefined}
                        options={{
                            minimap: { enabled: false },
                            formatOnPaste: true,
                            readOnly: jsonFormatMode === 'react-flow'
                        }}
                />
            </div>
        </Modal>
    );
};
