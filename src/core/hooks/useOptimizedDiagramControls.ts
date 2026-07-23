/**
 * 优化版图表控制 Hook
 * 提供缓存、防抖和性能优化功能
 */

import { useCallback, useRef, useMemo } from 'react';
import { dispatchDiagramControl } from '../components/shared/diagramControl';
import {
  getTargetDiagramElement,
  temporarilyHideElements,
  _exportElementToPngDataUrl,
  _exportElementToSvgDataUrl,
  exportFullDiagramByAdjustingViewportToPngDataUrl,
  buildExportFileName,
  triggerDownload,
} from '../components/shared/exportUtils';
import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';
import { logDiagramExportEventDispatchFailure } from './diagramExportLogging';
import {
  buildRenderSceneFromGlobalReactFlow,
  buildRenderSceneFromReactFlowSnapshot,
  type ReactFlowRenderSnapshot,
} from '../rendering/reactFlowScene';
import { exportRenderSceneToSvgDataUrl } from '../export/svgExport';

// 防抖函数类型
type DebouncedFunction<TArgs extends unknown[]> = {
  callback: (...args: TArgs) => void;
  cancel: () => void;
};

/**
 * 创建防抖函数
 */
function useDebounce<TArgs extends unknown[]>(
  func: (...args: TArgs) => unknown,
  delay: number
): DebouncedFunction<TArgs> {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const callback = useCallback((...args: TArgs) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      func(...args);
    }, delay);
  }, [delay, func]);

  return useMemo(() => ({ callback, cancel }), [callback, cancel]);
}

/**
 * 创建节流函数
 */
function useThrottle<TArgs extends unknown[], TResult>(
  func: (...args: TArgs) => TResult,
  delay: number
): (...args: TArgs) => TResult | undefined {
  const lastCallRef = useRef<number>(0);

  return useCallback((...args: TArgs) => {
    const now = Date.now();
    if (now - lastCallRef.current >= delay) {
      lastCallRef.current = now;
      return func(...args);
    }
  }, [func, delay]);
}

/**
 * 导出配置接口
 */
interface ExportConfig {
  /** PNG导出质量 (0-1) */
  pngQuality?: number;
  /** PDF页面大小 */
  pdfPageSize?: 'a4' | 'a3' | 'letter';
  /** SVG导出配置 */
  svgOptions?: {
    /** 是否包含样式 */
    includeStyles?: boolean;
    /** 是否包含外部资源 */
    includeExternalResources?: boolean;
  };
  /** 导出边距 */
  margin?: number;
  /** 是否包含背景 */
  includeBackground?: boolean;
  /** 导出缩放比例 */
  scale?: number;
  getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
}

const serializeExportError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

/**
 * 优化版图表控制 Hook
 */
export const useOptimizedDiagramControls = (
  diagramId: string,
  config: ExportConfig = {}
) => {
  /**
   * 派发导出相关的全局事件，供 UI 显示等待/进度
   * @param name 事件名：diagramExportStart / diagramExportComplete / diagramExportError
   * @param detail 附带数据：包含 diagramId、type 等
   */
  const dispatchExportEvent = (name: string, detail: unknown) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
      logDiagramExportEventDispatchFailure('useOptimizedDiagramControls', name, error);
    }
  };
  // 导出状态缓存
  const exportStateRef = useRef<{
    isExporting: boolean;
    lastExportTime: number;
  }>({
    isExporting: false,
    lastExportTime: 0,
  });

  // 默认配置
  const exportConfig = useMemo(() => ({
    pngQuality: 0.95,
    pdfPageSize: 'a4' as const,
    margin: 40,
    includeBackground: true,
    scale: 1,
    ...config,
  }), [config]);

  /**
   * 适应视图 - 使用防抖优化
   */
  const { callback: handleFitDiagram, cancel: cancelFitDiagram } = useDebounce(
    useCallback(() => {
      dispatchDiagramControl('fit', diagramId);
    }, [diagramId]),
    150 // 150ms 防抖延迟
  );

  /**
   * 回到顶部 - 使用节流优化
   */
  const handleBackToTop = useThrottle(
    useCallback(() => {
      dispatchDiagramControl('top', diagramId);
    }, [diagramId]),
    300 // 300ms 节流间隔
  );

  /**
   * 切换全屏 - 使用防抖优化
   */
  const { callback: handleToggleFullscreen, cancel: cancelToggleFullscreen } = useDebounce(
    useCallback(() => {
      dispatchDiagramControl('fullscreen', diagramId);
    }, [diagramId]),
    100 // 100ms 防抖延迟
  );

  /**
   * 优化的PNG导出函数
   */
  const exportToPNG = useCallback(async (): Promise<void> => {
    // 防止重复导出
    if (exportStateRef.current.isExporting) {
      safeLog.warn('导出正在进行中，请稍候...');
      return;
    }

    // 限制导出频率（最少间隔2秒）
    const now = Date.now();
    if (now - exportStateRef.current.lastExportTime < 2000) {
      safeLog.warn('导出过于频繁，请稍候再试');
      return;
    }

    try {
      dispatchExportEvent('diagramExportStart', { diagramId, type: 'png' });
      exportStateRef.current.isExporting = true;
      exportStateRef.current.lastExportTime = now;

      // 导出前适应视图
      handleFitDiagram();
      await new Promise(resolve => setTimeout(resolve, 200));

      const diagramElement = getTargetDiagramElement(diagramId);
      if (!diagramElement) {
        throw new Error('无法找到要导出的架构图');
      }

      // 需要隐藏的元素选择器
      const elementsToHideSelectors = [
        '.react-flow__controls',
        '.react-flow__minimap',
        '.react-flow__background',
        '.mini-map',
        '.react-flow__minimap-container',
        '.diagram-controls',
        '.single-menu-toggle-floating',
        '.menu-toggle-floating',
        '.menu-toggle-btn'
      ];

      // 导出图片
      const dataUrl = await temporarilyHideElements(elementsToHideSelectors, async () => {
        return exportFullDiagramByAdjustingViewportToPngDataUrl(
          diagramId,
          exportConfig.margin,
          3
        );
      });

      triggerDownload(dataUrl, buildExportFileName(diagramId, 'png'));

      dispatchExportEvent('diagramExportComplete', { diagramId, type: 'png' });
    } catch (error) {
      safeLog.error('PNG导出失败:', redactSensitiveLogValue(error));
      dispatchExportEvent('diagramExportError', { diagramId, type: 'png', error: serializeExportError(error) });
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      exportStateRef.current.isExporting = false;
    }
  }, [diagramId, exportConfig, handleFitDiagram]);

  /**
   * 优化的SVG导出函数
   */
  const exportToSVG = useCallback(async (): Promise<void> => {
    // 防止重复导出
    if (exportStateRef.current.isExporting) {
      safeLog.warn('导出正在进行中，请稍候...');
      return;
    }

    // 限制导出频率（最少间隔2秒）
    const now = Date.now();
    if (now - exportStateRef.current.lastExportTime < 2000) {
      safeLog.warn('导出过于频繁，请稍候再试');
      return;
    }

    try {
      dispatchExportEvent('diagramExportStart', { diagramId, type: 'svg' });
      exportStateRef.current.isExporting = true;
      exportStateRef.current.lastExportTime = now;

      // 导出前适应视图
      handleFitDiagram();
      await new Promise(resolve => setTimeout(resolve, 200));

      const diagramElement = getTargetDiagramElement(diagramId);
      if (!diagramElement) {
        throw new Error('无法找到要导出的架构图');
      }

      // 需要隐藏的元素选择器
      const elementsToHideSelectors = [
        '.react-flow__controls',
        '.react-flow__minimap',
        '.react-flow__background',
        '.mini-map',
        '.react-flow__minimap-container',
        '.diagram-controls',
        '.single-menu-toggle-floating',
        '.menu-toggle-floating',
        '.menu-toggle-btn'
      ];

      const svgDataUrl = await temporarilyHideElements(elementsToHideSelectors, async () => {
        const snapshot = exportConfig.getReactFlowSnapshot?.();
        const scene = snapshot
          ? buildRenderSceneFromReactFlowSnapshot(snapshot, { padding: exportConfig.margin })
          : buildRenderSceneFromGlobalReactFlow({ padding: exportConfig.margin });
        return exportRenderSceneToSvgDataUrl(scene, { title: diagramId });
      });

      triggerDownload(svgDataUrl, buildExportFileName(diagramId, 'svg'));

      dispatchExportEvent('diagramExportComplete', { diagramId, type: 'svg' });
    } catch (error) {
      safeLog.error('SVG导出失败:', redactSensitiveLogValue(error));
      dispatchExportEvent('diagramExportError', { diagramId, type: 'svg', error: serializeExportError(error) });
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      exportStateRef.current.isExporting = false;
    }
  }, [diagramId, exportConfig, handleFitDiagram]);

  /**
   * 优化的PDF导出函数
   */
  const exportToPDF = useCallback(async (): Promise<void> => {
    // 防止重复导出
    if (exportStateRef.current.isExporting) {
      safeLog.warn('导出正在进行中，请稍候...');
      return;
    }

    // 限制导出频率
    const now = Date.now();
    if (now - exportStateRef.current.lastExportTime < 2000) {
      safeLog.warn('导出过于频繁，请稍候再试');
      return;
    }

    try {
      dispatchExportEvent('diagramExportStart', { diagramId, type: 'pdf' });
      exportStateRef.current.isExporting = true;
      exportStateRef.current.lastExportTime = now;

      // 导出前适应视图
      handleFitDiagram();
      await new Promise(resolve => setTimeout(resolve, 200));

      const diagramElement = getTargetDiagramElement(diagramId);
      if (!diagramElement) {
        throw new Error('无法找到要导出的架构图');
      }

      // 需要隐藏的元素选择器
      const elementsToHideSelectors = [
        '.react-flow__controls',
        '.react-flow__minimap',
        '.react-flow__background',
        '.mini-map',
        '.react-flow__minimap-container',
        '.diagram-controls',
        '.single-menu-toggle-floating',
        '.menu-toggle-floating',
        '.menu-toggle-btn'
      ];

      // 导出为PNG数据URL
      const dataUrl = await temporarilyHideElements(elementsToHideSelectors, async () => {
        return exportFullDiagramByAdjustingViewportToPngDataUrl(
          diagramId,
          exportConfig.margin,
          3
        );
      });

      // 动态引入jsPDF
      const { jsPDF } = await import('jspdf');

      // 创建PDF
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: exportConfig.pdfPageSize,
      });

      // 获取PDF页面尺寸
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // 创建图片对象以获取尺寸
      const img = new Image();
      img.onload = () => {
        const imgWidth = img.width;
        const imgHeight = img.height;

        // 计算缩放比例以适应页面
        const scaleX = (pageWidth - 20) / imgWidth;
        const scaleY = (pageHeight - 20) / imgHeight;
        const scale = Math.min(scaleX, scaleY);

        const finalWidth = imgWidth * scale;
        const finalHeight = imgHeight * scale;

        // 居中放置
        const x = (pageWidth - finalWidth) / 2;
        const y = (pageHeight - finalHeight) / 2;

        // 添加图片到PDF
        pdf.addImage(dataUrl, 'PNG', x, y, finalWidth, finalHeight);

        // 保存PDF
        pdf.save(buildExportFileName(diagramId, 'pdf'));

        dispatchExportEvent('diagramExportComplete', { diagramId, type: 'pdf' });
      };

      img.onerror = () => {
        const err = new Error('图片加载失败');
        dispatchExportEvent('diagramExportError', { diagramId, type: 'pdf', error: serializeExportError(err) });
        throw err;
      };

      img.src = dataUrl;

    } catch (error) {
      safeLog.error('PDF导出失败:', redactSensitiveLogValue(error));
      dispatchExportEvent('diagramExportError', { diagramId, type: 'pdf', error: serializeExportError(error) });
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      exportStateRef.current.isExporting = false;
    }
  }, [diagramId, exportConfig, handleFitDiagram]);

  /**
   * 获取导出状态
   */
  const getExportStatus = useCallback(() => ({
    isExporting: exportStateRef.current.isExporting,
    lastExportTime: exportStateRef.current.lastExportTime,
  }), []);

  /**
   * 清理函数
   */
  const cleanup = useCallback(() => {
    cancelFitDiagram();
    cancelToggleFullscreen();
    exportStateRef.current.isExporting = false;
  }, [cancelFitDiagram, cancelToggleFullscreen]);

  return {
    // 基础控制函数
    handleFitDiagram,
    handleBackToTop,
    handleToggleFullscreen,

    // 导出函数
    exportToPNG,
    exportToPDF,
    exportToSVG,

    // 状态和工具函数
    getExportStatus,
    cleanup,

    // 配置
    exportConfig,
  };
};
