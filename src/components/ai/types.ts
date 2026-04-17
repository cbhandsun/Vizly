import { Node, Edge } from '@xyflow/react';
import { AnalysisResult } from '@/utils/diagramAnalyzer';
import { Message, Conversation } from '@/services/ai/AIConversationService';

export interface CanvasOperations {
    /** 添加节点到画布（返回新节点 ID） */
    onAddNode?: (label: string, shape?: string) => string | void;
    /** 删除指定节点 */
    onDeleteNodes?: (nodeIds: string[]) => void;
    /** 连接两个节点 */
    onConnectNodes?: (sourceId: string, targetId: string, label?: string) => void;
    /** 触发自动布局 */
    onAutoLayout?: (strategy?: string) => void;
    /** 智能分组节点 */
    onGroupNodes?: (nodeIds: string[], groupName: string) => void;
    /** 执行图表巡检 */
    onAnalyze?: () => AnalysisResult;
    /** 导出图表 */
    onExport?: (type: 'png' | 'pdf' | 'svg' | 'gif') => void;
    /** 保存到云端 */
    onSave?: () => void;
    /** 分享图表 */
    onShare?: () => void;
    /** 更新全局主题样式 (CSS 变量映射) */
    onUpdateTheme?: (themeConfig: Record<string, string>) => void;
    /** 切换演示模式 */
    onTogglePresentation?: (active: boolean) => void;
    /** 演示指定链路路径 */
    onAnimatePath?: (edgeIds: string[], options?: { duration?: number; loop?: boolean }) => void;
}

export interface AIChatPanelProps {
    open: boolean;
    onClose: () => void;
    onOpenConfig: () => void;
    onApplyJson: (json: string) => void;
    onPreviewJson: (json: string) => void;
    /** 当前画布节点引用 */
    diagramNodesRef?: React.RefObject<Node[]>;
    diagramEdgesRef?: React.RefObject<Edge[]>;
    /** 画布直接操作回调 */
    canvasOps?: CanvasOperations;
    /** 当前插件 ID */
    pluginId?: string;
}

export type { Message, Conversation };
