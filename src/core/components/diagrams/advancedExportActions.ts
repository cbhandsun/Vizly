import { exportRenderSceneToPngDataUrl } from '../../export/svgRasterExport';
import { exportRenderSceneToSvgDataUrl } from '../../export/svgExport';
import {
  buildRenderSceneFromReactFlowSnapshot,
  type ReactFlowRenderSnapshot,
} from '../../rendering/reactFlowScene';
import {
  buildExportFileName,
  triggerDownload,
} from '../shared/exportUtils';
import {
  attachVizlyExportMetadata,
  downloadImage,
  type ExportOptions,
} from '../../utils/imageExporter';

export class AdvancedExportError extends Error {
  readonly code: 'ADVANCED_EXPORT_VECTOR_PDF_SNAPSHOT_REQUIRED';

  constructor() {
    super('Vector PDF export requires a current diagram scene snapshot');
    this.name = 'AdvancedExportError';
    this.code = 'ADVANCED_EXPORT_VECTOR_PDF_SNAPSHOT_REQUIRED';
  }
}

export interface RunAdvancedExportOptions {
  diagramId?: string;
  diagramTitle?: string;
  nodes: Parameters<typeof downloadImage>[0];
  format: ExportOptions['format'];
  pixelRatio: number;
  includeBackground: boolean;
  embedMetadata: boolean;
  getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
}

const canUseSceneExport = (format: ExportOptions['format']): format is 'png' | 'svg' | 'pdf' => (
  format === 'png' || format === 'svg' || format === 'pdf'
);

export const runAdvancedExport = async ({
  diagramId,
  diagramTitle,
  nodes,
  format,
  pixelRatio,
  includeBackground,
  embedMetadata,
  getReactFlowSnapshot,
}: RunAdvancedExportOptions): Promise<'scene' | 'fallback'> => {
  const title = diagramTitle?.trim() || diagramId?.trim() || 'advanced-export';
  const sceneFormat = canUseSceneExport(format) ? format : null;
  const snapshot = sceneFormat ? getReactFlowSnapshot?.() : null;
  if (format === 'pdf' && !snapshot) {
    throw new AdvancedExportError();
  }
  if (snapshot && sceneFormat) {
    const scene = buildRenderSceneFromReactFlowSnapshot(snapshot, { padding: 40 });
    if (sceneFormat === 'pdf') {
      const { exportRenderSceneToPdfBlob } = await import('../../export/scenePdfExport');
      const pdfBlob = await exportRenderSceneToPdfBlob(scene, { title, includeBackground });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      triggerDownload(pdfUrl, buildExportFileName(title, 'pdf'));
      return 'scene';
    } else {
      const baseDataUrl = sceneFormat === 'png'
        ? await exportRenderSceneToPngDataUrl(scene, { title, pixelRatio, includeBackground })
        : exportRenderSceneToSvgDataUrl(scene, { title, includeBackground });
      const dataUrl = embedMetadata
        ? await attachVizlyExportMetadata(baseDataUrl, sceneFormat, { nodes })
        : baseDataUrl;
      triggerDownload(dataUrl, buildExportFileName(title, sceneFormat));
      return 'scene';
    }
  }

  await downloadImage(nodes, {
    format,
    pixelRatio,
    includeBackground,
    embedMetadata,
    fileNameBase: title,
  });
  return 'fallback';
};
