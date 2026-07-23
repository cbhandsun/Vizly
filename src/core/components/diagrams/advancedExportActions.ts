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
import { downloadImage, type ExportOptions } from '../../utils/imageExporter';

export interface RunAdvancedExportOptions {
  diagramId?: string;
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
  nodes,
  format,
  pixelRatio,
  includeBackground,
  embedMetadata,
  getReactFlowSnapshot,
}: RunAdvancedExportOptions): Promise<'scene' | 'fallback'> => {
  const snapshot = canUseSceneExport(format) ? getReactFlowSnapshot?.() : null;
  if (snapshot) {
    const scene = buildRenderSceneFromReactFlowSnapshot(snapshot, { padding: 40 });
    const title = diagramId || 'advanced-export';
    const dataUrl = format === 'png'
      ? await exportRenderSceneToPngDataUrl(scene, { title, pixelRatio })
      : exportRenderSceneToSvgDataUrl(scene, { title });
    triggerDownload(dataUrl, buildExportFileName(title, format));
    return 'scene';
  }

  await downloadImage(nodes, {
    format,
    pixelRatio,
    includeBackground,
    embedMetadata,
  });
  return 'fallback';
};
