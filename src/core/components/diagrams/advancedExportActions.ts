import { exportRenderSceneToPngDataUrl } from '../../export/svgRasterExport';
import { exportRenderSceneToSvgDataUrl } from '../../export/svgExport';
import { exportRenderSceneToPdfBlob } from '../../export/scenePdfExport';
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
import { safeLog } from '../../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../../utils/logSecurity';

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
  if (snapshot && sceneFormat) {
    const scene = buildRenderSceneFromReactFlowSnapshot(snapshot, { padding: 40 });
    if (sceneFormat === 'pdf') {
      try {
        const pdfBlob = await exportRenderSceneToPdfBlob(scene, { title, includeBackground });
        const pdfUrl = URL.createObjectURL(pdfBlob);
        triggerDownload(pdfUrl, buildExportFileName(title, 'pdf'));
        return 'scene';
      } catch (error) {
        safeLog.warn(
          'Vector PDF export failed; using bounded raster fallback:',
          redactSensitiveLogValue(error),
        );
      }
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
