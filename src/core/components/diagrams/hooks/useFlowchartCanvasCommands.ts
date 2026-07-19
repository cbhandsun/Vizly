import { useCallback } from 'react';
import type React from 'react';
import type { TFunction } from 'i18next';
import { BackgroundVariant, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';

import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { downloadFile } from '../../../utils/downloadUtils';
import { DiagramIntelligenceService } from '../../../services/DiagramIntelligenceService';
import {
    applyFlowchartTemplate,
    copyFlowchartAsMermaid,
    exportFlowchartAsMermaid,
} from '../flowchartDesignerCanvasActions';
import { buildFlowchartEdgeInsertionPlan } from '../flowchartEdgeInsertion';
import {
    buildFlowchartClearCanvasConfirm,
    clearFlowchartCanvas,
} from '../flowchartClearCanvas';
import { runFlowchartSmartOptimize } from '../flowchartSmartOptimize';

type TemplateApplyOptions = Parameters<typeof applyFlowchartTemplate>[0];

interface UseFlowchartCanvasCommandsOptions {
    t: TFunction;
    getNodes: () => Node[];
    getEdges: () => Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    handleStrategyLayout: (
        strategyName: string,
        nodeLayout?: string,
        direction?: 'TB' | 'LR',
    ) => void | Promise<void>;
    isReadonly: boolean;
    gridVariant: BackgroundVariant;
    setGridVariant: React.Dispatch<React.SetStateAction<BackgroundVariant>>;
    setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
    setJsonEditorVisible: React.Dispatch<React.SetStateAction<boolean>>;
    reactFlowInstance: ReactFlowInstance | null;
    viewport: TemplateApplyOptions['viewport'];
    createFromTemplate: TemplateApplyOptions['createFromTemplate'];
    selectedNodes: Node[];
    updateNodesBatch: (ids: string[], updates: any) => void;
}

export function useFlowchartCanvasCommands({
    t,
    getNodes,
    getEdges,
    setNodes,
    setEdges,
    takeSnapshot,
    handleStrategyLayout,
    isReadonly,
    gridVariant,
    setGridVariant,
    setShowGrid,
    setJsonEditorVisible,
    reactFlowInstance,
    viewport,
    createFromTemplate,
    selectedNodes,
    updateNodesBatch,
}: UseFlowchartCanvasCommandsOptions) {
    const handleSmartLayout = useCallback(async () => {
        const { recommendLayout } = await import('../../../utils/layoutRecommender');
        const recommendation = recommendLayout(getNodes(), getEdges());
        appMessage.info(t('designer.flowchart.smartLayout', {
            reason: recommendation.reason,
            confidence: Math.round(recommendation.confidence * 100),
        }));
        await handleStrategyLayout(
            recommendation.domainStrategy,
            recommendation.nodeLayout,
            recommendation.direction,
        );
    }, [getEdges, getNodes, handleStrategyLayout, t]);

    const handleSmartOptimize = useCallback(async () => {
        const intelligence = DiagramIntelligenceService.getInstance();
        const result = await runFlowchartSmartOptimize({
            nodes: getNodes(),
            edges: getEdges(),
            takeSnapshot,
            optimize: intelligence.optimize.bind(intelligence),
        });
        setNodes(result.nodes);
        setEdges(result.edges);
        appMessage.success(t('designer.flowchart.optimize', {
            overlaps: result.stats.rectifiedOverlaps,
            nodes: result.stats.alignedNodes,
        }));
    }, [getEdges, getNodes, setEdges, setNodes, t, takeSnapshot]);

    const handleEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
        if (isReadonly) return;
        const currentNodes = getNodes();
        const currentEdges = getEdges();
        const insertionPlan = buildFlowchartEdgeInsertionPlan({
            edge,
            nodes: currentNodes,
            label: t('designer.flowchart.newNode'),
        });
        if (!insertionPlan) return;

        takeSnapshot(currentNodes, currentEdges);
        setNodes(nodes => [...nodes, insertionPlan.node]);
        setEdges(edges => [...edges.filter(candidate => candidate.id !== edge.id), ...insertionPlan.replacementEdges]);
        appMessage.success(t('designer.flowchart.edgeNodeInserted'));
    }, [getEdges, getNodes, isReadonly, setEdges, setNodes, t, takeSnapshot]);

    const handleGridRotate = useCallback(() => {
        const variants = [BackgroundVariant.Lines, BackgroundVariant.Dots, BackgroundVariant.Cross];
        const currentIndex = variants.indexOf(gridVariant);
        setGridVariant(variants[(currentIndex + 1) % variants.length]);
        setShowGrid(true);
    }, [gridVariant, setGridVariant, setShowGrid]);

    const handleExport = useCallback(() => setJsonEditorVisible(true), [setJsonEditorVisible]);
    const handleClearCanvasCommand = useCallback(() => {
        appModal.confirm(buildFlowchartClearCanvasConfirm({
            title: t('designer.flowchart.clearCanvas.title'),
            content: t('designer.flowchart.clearCanvas.content'),
            okText: t('designer.flowchart.clearCanvas.ok'),
            cancelText: t('designer.flowchart.clearCanvas.cancel'),
            onConfirm: () => clearFlowchartCanvas({ setNodes, setEdges, takeSnapshot }),
        }));
    }, [setEdges, setNodes, t, takeSnapshot]);

    const handleExportMermaid = useCallback(async () => {
        try {
            await exportFlowchartAsMermaid({ nodes: getNodes(), edges: getEdges(), downloadFile });
        } catch (error: any) {
            appMessage.error(error.message);
        }
    }, [getEdges, getNodes]);

    const handleCopyAsMermaid = useCallback(async () => {
        try {
            if (!navigator.clipboard) return;
            await copyFlowchartAsMermaid({
                nodes: getNodes(),
                edges: getEdges(),
                writeText: content => navigator.clipboard.writeText(content),
            });
            appMessage.success(t('designer.flowchart.mermaidCopied'));
        } catch (error: any) {
            appMessage.error(error.message);
        }
    }, [getEdges, getNodes, t]);

    const handleUseTemplate = useCallback((template: TemplateApplyOptions['template']) => {
        if (!reactFlowInstance) return;
        takeSnapshot(getNodes(), getEdges());
        applyFlowchartTemplate({
            template,
            viewport,
            createFromTemplate,
            appendNodes: nextNodes => setNodes(nodes => [...nodes, ...nextNodes]),
            appendEdges: nextEdges => setEdges(edges => [...edges, ...nextEdges]),
        });
        appMessage.success(t('designer.flowchart.templateApplied'));
    }, [createFromTemplate, getEdges, getNodes, reactFlowInstance, setEdges, setNodes, t, takeSnapshot, viewport]);

    const handleOpacity = useCallback((opacity: number) => {
        updateNodesBatch(selectedNodes.map(node => node.id), { style: { opacity } });
    }, [selectedNodes, updateNodesBatch]);

    return {
        handleSmartLayout,
        handleSmartOptimize,
        handleEdgeDoubleClick,
        handleGridRotate,
        handleExport,
        handleClearCanvasCommand,
        handleExportMermaid,
        handleCopyAsMermaid,
        handleUseTemplate,
        handleOpacity,
    };
}
