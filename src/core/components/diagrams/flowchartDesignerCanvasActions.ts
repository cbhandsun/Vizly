import type { Edge, Node } from '@xyflow/react';
import type { NodeTemplate } from './hooks/useNodeTemplates';

import { readDomViewport, readReactFlowCanvasSize } from '../../utils/domViewport';
import { buildFlowchartMermaidExport } from './flowchartMermaidExport';
import { buildFlowchartTemplateApplyPlan } from './flowchartTemplateApply';
import {
    createFlowchartMindMapNode,
    createFlowchartStickyNoteNode,
} from './flowchartViewportNodeFactory';

type MermaidExportArtifact = {
    content: string;
    filename: string;
    mimeType: string;
};

type NodeTemplateLike = NodeTemplate;

type ViewportLike = {
    x: number;
    y: number;
    zoom: number;
};

export const exportFlowchartAsMermaid = async ({
    nodes,
    edges,
    downloadFile,
    buildExport = buildFlowchartMermaidExport,
}: {
    nodes: Node[];
    edges: Edge[];
    downloadFile: (content: string, filename: string, mimeType: string) => void;
    buildExport?: (options: { nodes: Node[]; edges: Edge[] }) => Promise<MermaidExportArtifact>;
}): Promise<MermaidExportArtifact> => {
    const artifact = await buildExport({ nodes, edges });
    downloadFile(artifact.content, artifact.filename, artifact.mimeType);
    return artifact;
};

export const copyFlowchartAsMermaid = async ({
    nodes,
    edges,
    writeText,
    buildExport = buildFlowchartMermaidExport,
}: {
    nodes: Node[];
    edges: Edge[];
    writeText: (content: string) => Promise<void>;
    buildExport?: (options: { nodes: Node[]; edges: Edge[] }) => Promise<MermaidExportArtifact>;
}): Promise<MermaidExportArtifact> => {
    const artifact = await buildExport({ nodes, edges });
    await writeText(artifact.content);
    return artifact;
};

export const applyFlowchartTemplate = ({
    template,
    viewport,
    createFromTemplate,
    appendNodes,
    appendEdges,
}: {
    template: NodeTemplateLike;
    viewport: ViewportLike;
    createFromTemplate: (
        template: NodeTemplateLike,
        viewportX: number,
        viewportY: number,
        viewportZoom: number
    ) => { nodes: Node[]; edges: Edge[] };
    appendNodes: (nodes: Node[]) => void;
    appendEdges: (edges: Edge[]) => void;
}): { nodes: Node[]; edges: Edge[] } => {
    const plan = buildFlowchartTemplateApplyPlan({
        template,
        viewport,
        createFromTemplate,
    });
    appendNodes(plan.nodes);
    appendEdges(plan.edges);
    return plan;
};

export const addFlowchartStickyNote = ({
    layer,
    setNodes,
    readViewport = readDomViewport,
    readCanvasSize = readReactFlowCanvasSize,
    offset = Math.floor(Math.random() * 40) - 20,
}: {
    layer: string;
    setNodes: (updater: (nodes: Node[]) => Node[]) => void;
    readViewport?: typeof readDomViewport;
    readCanvasSize?: typeof readReactFlowCanvasSize;
    offset?: number;
}): Node => {
    const stickyNode = createFlowchartStickyNoteNode({
        viewport: readViewport(),
        canvasSize: readCanvasSize(),
        layer,
        offset,
    });
    setNodes((nodes) => [...nodes, stickyNode]);
    return stickyNode;
};

export const addFlowchartMindMapNode = ({
    layer,
    label,
    setNodes,
    readViewport = readDomViewport,
    readCanvasSize = readReactFlowCanvasSize,
}: {
    layer: string;
    label: string;
    setNodes: (updater: (nodes: Node[]) => Node[]) => void;
    readViewport?: typeof readDomViewport;
    readCanvasSize?: typeof readReactFlowCanvasSize;
}): Node => {
    const mindMapNode = createFlowchartMindMapNode({
        viewport: readViewport(),
        canvasSize: readCanvasSize(),
        layer,
        label,
    });
    setNodes((nodes) => [...nodes, mindMapNode]);
    return mindMapNode;
};
