// @ts-nocheck
import { useCallback } from 'react';
import { dispatchDiagramControl } from '../components/shared/diagramControl';
import { getTargetDiagramElement, temporarilyHideElements, exportElementToPngDataUrl, exportElementToSvgDataUrl, buildExportFileName, exportFullDiagramToPngDataUrl, exportFullDiagramToSvgDataUrl, exportFullDiagramByAdjustingViewportToPngDataUrl, exportFullDiagramByAdjustingViewportToSvgDataUrl, exportGifFrameWithAnimationClone, exportGifFramesWithAnimationCloneBatch } from '../components/shared/exportUtils';
import { createGIF, type CreateOptions } from 'gifshot';

export const useDiagramControls = (diagramId: string, enableMainFlowAnimation: boolean = true) => {
  /**
   * 派发导出相关的全局事件，供 UI 显示等待/进度
   * @param name 事件名：diagramExportStart / diagramExportProgress / diagramExportComplete / diagramExportError
   * @param detail 附带数据：包含 diagramId、type、progress 等
   */
  const dispatchExportEvent = (name: string, detail: any) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {
      // 忽略事件派发异常，避免影响导出流程
    }
  };

  /**
   * 在导出开始前让浏览器完成一次绘制（requestAnimationFrame）。
   * 目的：确保遮层/loading 能立刻显示，避免被后续的同步布局与 DOM 操作阻塞。
   */
  const yieldToPaint = useCallback(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  }), []);
  const handleFitDiagram = useCallback(() => {
    dispatchDiagramControl('fit', diagramId);
  }, [diagramId]);

  const handleBackToTop = useCallback(() => {
    dispatchDiagramControl('top', diagramId);
  }, [diagramId]);

  const handleToggleFullscreen = useCallback(() => {
    dispatchDiagramControl('fullscreen', diagramId);
  }, [diagramId]);

  /**
   * 导出为 PNG
   * - 隐藏控件/网格，提升像素比，设置白色背景
   * - 成功后下载文件并派发开始/完成事件
   */
  const exportToPNG = useCallback(async () => {
    try {
      dispatchExportEvent('diagramExportStart', { diagramId, type: 'png' });
      // 让浏览器先渲染遮层，再进入较重的导出流程
      await yieldToPaint();
      const diagramElement = getTargetDiagramElement(diagramId);
      if (!diagramElement) {
        alert('无法找到要导出的架构图');
        dispatchExportEvent('diagramExportError', { diagramId, type: 'png', error: 'element_not_found' });
        return;
      }

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

      const dataUrl = await temporarilyHideElements(elementsToHideSelectors, async () => {
        // 优先使用“视口兜底导出”，避免离屏克隆导致空白
        return exportFullDiagramByAdjustingViewportToPngDataUrl(diagramId, 40, 3);
      });

      const link = document.createElement('a');
      link.download = buildExportFileName(diagramId, 'png');
      link.href = dataUrl;
      link.click();
      dispatchExportEvent('diagramExportComplete', { diagramId, type: 'png' });
    } catch (error) {
      console.error('导出PNG失败:', error);
      dispatchExportEvent('diagramExportError', { diagramId, type: 'png', error });
      alert('导出PNG失败，请稍后重试');
    }
  }, [diagramId, handleFitDiagram, yieldToPaint]);

  /**
   * 导出为 PDF
   * - 隐藏控件/网格，使用 PNG 画布插入 PDF 并居中缩放
   * - 成功后下载文件并派发开始/完成事件
   */
  const exportToPDF = useCallback(async () => {
    try {
      dispatchExportEvent('diagramExportStart', { diagramId, type: 'pdf' });
      // 让浏览器先渲染遮层，再进入较重的导出流程
      await yieldToPaint();
      const diagramElement = getTargetDiagramElement(diagramId);
      if (!diagramElement) {
        alert('无法找到要导出的架构图');
        dispatchExportEvent('diagramExportError', { diagramId, type: 'pdf', error: 'element_not_found' });
        return;
      }

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

      const dataUrl = await temporarilyHideElements(elementsToHideSelectors, async () => {
        // 使用视口兜底整图 PNG 作为 PDF 画布，保证整图内容
        return exportFullDiagramByAdjustingViewportToPngDataUrl(diagramId, 40, 3);
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      const paddedWidth = img.naturalWidth;
      const paddedHeight = img.naturalHeight;
      const isPortrait = paddedHeight > paddedWidth;
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: isPortrait ? 'portrait' : 'landscape',
        unit: 'px',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth() - 80;
      const pdfHeight = pdf.internal.pageSize.getHeight() - 80;
      const scale = Math.min(pdfWidth / paddedWidth, pdfHeight / paddedHeight);
      const scaledWidth = paddedWidth * scale;
      const scaledHeight = paddedHeight * scale;

      pdf.addImage(
        dataUrl,
        'PNG',
        (pdf.internal.pageSize.getWidth() - scaledWidth) / 2,
        (pdf.internal.pageSize.getHeight() - scaledHeight) / 2,
        scaledWidth,
        scaledHeight
      );

      pdf.save(buildExportFileName(diagramId, 'pdf'));
      dispatchExportEvent('diagramExportComplete', { diagramId, type: 'pdf' });
    } catch (error) {
      console.error('导出PDF失败:', error);
      dispatchExportEvent('diagramExportError', { diagramId, type: 'pdf', error });
      alert('导出PDF失败，请稍后重试');
    }
  }, [diagramId, handleFitDiagram, yieldToPaint]);

  /**
   * 导出为 SVG
   * - 离屏导出，保持主视图不变；背景统一为白色
   * - 成功后下载文件并派发开始/完成事件
   */
  const exportToSVG = useCallback(async () => {
    try {
      dispatchExportEvent('diagramExportStart', { diagramId, type: 'svg' });
      // 让浏览器先渲染遮层，再进入较重的导出流程
      await yieldToPaint();
      const diagramElement = getTargetDiagramElement(diagramId);
      if (!diagramElement) {
        alert('无法找到要导出的架构图');
        dispatchExportEvent('diagramExportError', { diagramId, type: 'svg', error: 'element_not_found' });
        return;
      }

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
        return exportFullDiagramByAdjustingViewportToSvgDataUrl(diagramId, 40);
      });

      const link = document.createElement('a');
      link.download = buildExportFileName(diagramId, 'svg');
      link.href = svgDataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      dispatchExportEvent('diagramExportComplete', { diagramId, type: 'svg' });
    } catch (error) {
      console.error('导出SVG失败:', error);
      dispatchExportEvent('diagramExportError', { diagramId, type: 'svg', error });
      alert('导出SVG失败，请稍后重试');
    }
  }, [diagramId, handleFitDiagram, yieldToPaint]);

  /**
   * 导出为 GIF（动图）
   * - 使用多帧采样捕获动线动画效果
   * - 统一白色背景；在采样过程中派发进度事件
   * - 支持主流程动线控制，根据enableMainFlowAnimation参数决定是否捕获动画效果
   */
  const exportToGIF = useCallback(async () => {
    try {
      dispatchExportEvent('diagramExportStart', { diagramId, type: 'gif' });
      await yieldToPaint();
      const diagramElement = getTargetDiagramElement(diagramId);
      if (!diagramElement) {
        alert('无法找到要导出的架构图');
        dispatchExportEvent('diagramExportError', { diagramId, type: 'gif', error: 'element_not_found' });
        return;
      }

      // 根据主流程动线设置调整帧率和总帧数（兼顾丝滑与性能）
      const fps = enableMainFlowAnimation ? 12 : 2;         // 主流程动线开启使用12fps
      const totalFrames = enableMainFlowAnimation ? 24 : 3; // 总帧数下调至24，显著减少导出时间
      const paddingPx = 32;  // 边距

      // 首先获取架构图的原始尺寸（使用离屏克隆方式，避免修改真实DOM）
      const originalSizeFrame = await exportFullDiagramToPngDataUrl(diagramId, paddingPx, 1);
      const tempImg = new Image();
      await new Promise<void>((resolve) => {
        tempImg.onload = () => resolve();
        tempImg.src = originalSizeFrame;
      });
      
      const originalWidth = tempImg.naturalWidth || tempImg.width;
      const originalHeight = tempImg.naturalHeight || tempImg.height;

      // 根据原始尺寸计算合适的GIF尺寸（保持宽高比，最大边不超过2000px）
      const MAX_GIF_SIDE = Math.min(2000, Math.max(originalWidth, originalHeight));
      const scale = Math.min(1, MAX_GIF_SIDE / Math.max(originalWidth, originalHeight));
      const targetWidth = Math.round(originalWidth * scale);
      const targetHeight = Math.round(originalHeight * scale);

      // 首先确保字体和动画效果已经完全加载
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 使用现代浏览器API确保所有字体完全加载
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try {
          // 等待所有字体加载完成
          await document.fonts.ready;
          
          // 强制重排和重绘以确保字体渲染稳定
          /**
           * 强制触发布局与重绘，确保字体渲染稳定
           * 绑定容器到 id="diagram-${diagramId}"，避免选错元素导致重排无效
           */
          const forceReflow = () => {
            // 使用严格绑定的容器ID，避免选择错误元素导致重排无效
            const container = document.querySelector(`#diagram-${diagramId}`);
            if (container) {
              void (container as HTMLElement).offsetHeight;
              void (container as HTMLElement).offsetWidth;
            }
          };
          
          forceReflow();
          await new Promise(resolve => setTimeout(resolve, 100));
          forceReflow();
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.warn('字体加载API不可用，使用回退方案:', error);
          // 回退方案：简单的等待
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        // 对于不支持fonts API的浏览器，使用更长的等待时间
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      // 一次性捕获所有帧，使用专门的动画帧捕获函数
      const frames: string[] = await temporarilyHideElements([
        '.react-flow__controls',
        '.react-flow__minimap',
        '.react-flow__background',
        'svg.react-flow__background',
        '.mini-map',
        '.react-flow__minimap-container',
        '.diagram-controls',
        '.single-menu-toggle-floating',
        '.menu-toggle-floating',
        '.menu-toggle-btn'
      ], async () => {
        // 优先使用批量离屏克隆方案（一次克隆，多次截图）
        try {
          const batchFrames = await exportGifFramesWithAnimationCloneBatch(
            diagramId,
            paddingPx,
            2.25,
            totalFrames,
            (fi, tf) => {
              const progress = fi / tf;
              dispatchExportEvent('diagramExportProgress', {
                diagramId,
                type: 'gif',
                progress: progress * 0.8,
                frameIndex: fi - 1,
                frameCount: tf,
                stage: 'capturing'
              });
            }
          );
          return batchFrames;
        } catch (e) {
          console.warn('批量离屏克隆方案失败，回退到逐帧克隆方案：', e);
          const capturedFrames: string[] = [];
          for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
            let frame: string;
            try {
              frame = await exportGifFrameWithAnimationClone(diagramId, paddingPx, 2.25, frameIndex, totalFrames);
            } catch (_) {
              // 最终退化为静态帧捕获，保持流程不中断（可能导致GIF静态）
              frame = await exportElementToPngDataUrl(diagramElement, paddingPx, 2.25);
            }
            capturedFrames.push(frame);
            const progress = (frameIndex + 1) / totalFrames;
            dispatchExportEvent('diagramExportProgress', { diagramId, type: 'gif', progress: progress * 0.8, frameIndex, frameCount: totalFrames, stage: 'capturing' });
          }
          return capturedFrames;
        }
      });

      await new Promise<void>((resolve) => {
        const loadedImages: HTMLImageElement[] = [];
        let imagesLoaded = 0;

        const _MAX_GIF_SIDE = 1200;
        frames.forEach((frameDataUrl, index) => {
          const img = new Image();
          img.onload = () => {
            loadedImages[index] = img;
            imagesLoaded++;

            if (imagesLoaded === frames.length) {
          // 使用预先计算的目标尺寸，确保所有帧尺寸一致
          const gifW = targetWidth;
          const gifH = targetHeight;

          const tryCreateGif = (width: number, height: number, attempt: number = 1) => {
            const options: CreateOptions = {
              images: loadedImages,
              // 动态设置帧间隔，保证导出动画与预期速度一致
              interval: 1 / fps,
              gifWidth: width,
              gifHeight: height,
              numWorkers: 3,
              sampleInterval: 4, // 清晰度略增，同时保持较好的速度
              quality: 9, // 清晰度更好，体积稍增
              dither: false, // 禁用抖动以获得更清晰的线条
              transparent: false,
              crossOrigin: 'Anonymous',
              progressCallback: (captureProgress: number) => {
                const totalProgress = 0.8 + (captureProgress * 0.2);
                dispatchExportEvent('diagramExportProgress', { 
                  diagramId, 
                  type: 'gif', 
                  progress: totalProgress,
                  stage: 'encoding'
                });
              }
            };
                createGIF(options, (obj) => {
                  if (obj.error || !obj.image) {
                    console.warn(`GIF 创建失败（第${attempt}次）：`, obj.errorMsg || obj.errorCode);
                    if (attempt === 1) {
                      const FALLBACK_MAX_SIDE = 1500;
              const fallbackScale = Math.min(1, FALLBACK_MAX_SIDE / Math.max(targetWidth, targetHeight));
              const fallbackW = Math.max(1, Math.round(targetWidth * fallbackScale));
              const fallbackH = Math.max(1, Math.round(targetHeight * fallbackScale));
              tryCreateGif(fallbackW, fallbackH, 2);
                      return;
                    }
                    dispatchExportEvent('diagramExportError', { diagramId, type: 'gif', error: obj.errorMsg || obj.errorCode });
                    alert('导出GIF失败，请稍后重试');
                    resolve();
                    return;
                  }
                  const link = document.createElement('a');
                  link.download = buildExportFileName(diagramId, 'gif');
                  link.href = obj.image;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  dispatchExportEvent('diagramExportComplete', { diagramId, type: 'gif' });
                  resolve();
                });
              };
              tryCreateGif(gifW, gifH, 1);
            }
          };
          img.onerror = () => {
            console.warn(`帧 ${index} 加载失败`);
            imagesLoaded++;
            if (imagesLoaded === frames.length && loadedImages.length > 0) {
              // 降级处理：使用预先计算的目标尺寸
              const gifW = targetWidth;
              const gifH = targetHeight;
              
              /**
               * 尝试创建 GIF（含回退尺寸），帧间隔根据 fps 动态计算
               * - 使用更多 workers 和更高质量参数提升编码质量
               */
              const tryCreateGif = (width: number, height: number, attempt: number = 1) => {
                const options: CreateOptions = {
                  images: loadedImages,
                  // 动态设置帧间隔，保证导出动画与预期速度一致
                  interval: 1 / fps,
                  gifWidth: width,
                  gifHeight: height,
                  numWorkers: 4,
                  sampleInterval: 3,
                  quality: 10,
                  dither: false,
                  transparent: false,
                  crossOrigin: 'Anonymous'
                };
                createGIF(options, (obj) => {
                  if (obj.error || !obj.image) {
                    console.warn(`GIF 创建失败（第${attempt}次）：`, obj.errorMsg || obj.errorCode);
                    if (attempt === 1) {
                      const FALLBACK_MAX_SIDE = 900;
                      const fallbackScale = Math.min(1, FALLBACK_MAX_SIDE / Math.max(targetWidth, targetHeight));
                      const fallbackW = Math.max(1, Math.round(targetWidth * fallbackScale));
                      const fallbackH = Math.max(1, Math.round(targetHeight * fallbackScale));
                      tryCreateGif(fallbackW, fallbackH, 2);
                      return;
                    }
                    dispatchExportEvent('diagramExportError', { diagramId, type: 'gif', error: obj.errorMsg || obj.errorCode });
                    alert('导出GIF失败，请稍后重试');
                    resolve();
                    return;
                  }
                  const link = document.createElement('a');
                  link.download = buildExportFileName(diagramId, 'gif');
                  link.href = obj.image;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  dispatchExportEvent('diagramExportComplete', { diagramId, type: 'gif' });
                  resolve();
                });
              };
              tryCreateGif(gifW, gifH, 1);
            }
          };
          img.src = frameDataUrl;
        });
      });
    } catch (error) {
      console.error('导出GIF失败:', error);
      dispatchExportEvent('diagramExportError', { diagramId, type: 'gif', error });
      alert('导出GIF失败，请稍后重试');
    }
  }, [diagramId, handleFitDiagram]);

  return { handleFitDiagram, handleBackToTop, handleToggleFullscreen, exportToPNG, exportToPDF, exportToSVG, exportToGIF };
};
