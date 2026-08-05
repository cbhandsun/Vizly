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

const canUseSceneExport = (format: ExportOptions['format']): format is 'png' | 'svg' => (
  format === 'png' || format === 'svg'
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
  if (snapshot && sceneFormat) {
    const scene = buildRenderSceneFromReactFlowSnapshot(snapshot, { padding: 40 });
    const baseDataUrl = sceneFormat === 'png'
      ? await exportRenderSceneToPngDataUrl(scene, { title, pixelRatio, includeBackground })
      : exportRenderSceneToSvgDataUrl(scene, { title, includeBackground });
    const dataUrl = embedMetadata
      ? await attachVizlyExportMetadata(baseDataUrl, sceneFormat, { nodes })
      : baseDataUrl;
    triggerDownload(dataUrl, buildExportFileName(title, sceneFormat));
    return 'scene';
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
