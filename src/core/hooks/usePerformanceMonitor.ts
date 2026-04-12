/**
 * 性能监控Hook
 * 提供React组件中使用性能监控的便捷方法
 */

import { useEffect, useRef, useCallback } from 'react';
import { 
  performanceMonitor, 
  recordComponentRender, 
  recordInteraction,
  recordError 
} from '../utils/performanceMonitor';

/**
 * 组件性能监控Hook
 * 自动监控组件的渲染性能
 */
export function useComponentPerformance(componentName: string) {
  const renderStartTime = useRef<number>(0);
  const mountStartTime = useRef<number>(0);

  useEffect(() => {
    // 记录组件挂载开始时间
    mountStartTime.current = performance.now();

    return () => {
      // 组件卸载时记录挂载时长
      const mountTime = performance.now() - mountStartTime.current;
      recordComponentRender(`${componentName}_mount`, mountTime);
    };
  }, [componentName]);

  // 开始渲染计时
  const startRenderTiming = useCallback(() => {
    renderStartTime.current = performance.now();
  }, []);

  // 结束渲染计时
  const endRenderTiming = useCallback(() => {
    if (renderStartTime.current > 0) {
      const renderTime = performance.now() - renderStartTime.current;
      recordComponentRender(componentName, renderTime);
      renderStartTime.current = 0;
    }
  }, [componentName]);

  return {
    startRenderTiming,
    endRenderTiming
  };
}

/**
 * 用户交互性能监控Hook
 */
export function useInteractionPerformance() {
  const interactionStartTime = useRef<number>(0);

  // 开始交互计时
  const startInteraction = useCallback((interactionType: string) => {
    interactionStartTime.current = performance.now();
  }, []);

  // 结束交互计时
  const endInteraction = useCallback((interactionType: string) => {
    if (interactionStartTime.current > 0) {
      const latency = performance.now() - interactionStartTime.current;
      recordInteraction(interactionType, latency);
      interactionStartTime.current = 0;
    }
  }, []);

  // 记录点击事件性能
  const trackClick = useCallback((elementName: string) => {
    return (event: React.MouseEvent) => {
      const startTime = performance.now();
      
      // 使用requestAnimationFrame确保DOM更新完成后再计算
      requestAnimationFrame(() => {
        const latency = performance.now() - startTime;
        recordInteraction(`click_${elementName}`, latency);
      });
    };
  }, []);

  // 记录输入事件性能
  const trackInput = useCallback((inputName: string) => {
    return (event: React.ChangeEvent) => {
      const startTime = performance.now();
      
      requestAnimationFrame(() => {
        const latency = performance.now() - startTime;
        recordInteraction(`input_${inputName}`, latency);
      });
    };
  }, []);

  return {
    startInteraction,
    endInteraction,
    trackClick,
    trackInput
  };
}

/**
 * 错误监控Hook
 */
export function useErrorMonitoring(componentName: string) {
  // 记录组件错误
  const logError = useCallback((error: Error, additionalData?: Record<string, any>) => {
    recordError(error, {
      component: componentName,
      ...additionalData
    });
  }, [componentName]);

  // 安全执行函数，自动捕获错误
  const safeExecute = useCallback(async <T>(
    fn: () => T | Promise<T>,
    errorContext?: string
  ): Promise<T | null> => {
    try {
      return await fn();
    } catch (error) {
      logError(error as Error, { context: errorContext });
      return null;
    }
  }, [logError]);

  // 包装异步函数，自动错误处理
  const wrapAsync = useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    errorContext?: string
  ) => {
    return async (...args: T): Promise<R | null> => {
      return safeExecute(() => fn(...args), errorContext);
    };
  }, [safeExecute]);

  return {
    logError,
    safeExecute,
    wrapAsync
  };
}

/**
 * 资源加载性能监控Hook
 */
export function useResourcePerformance() {
  // 监控图片加载性能
  const trackImageLoad = useCallback((imageName: string) => {
    return {
      onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => {
        const img = event.currentTarget;
        const loadTime = performance.now();
        
        // 获取资源加载时间
        const entries = performance.getEntriesByName(img.src);
        if (entries.length > 0) {
          const entry = entries[entries.length - 1];
          const resourceEntry = entry as PerformanceResourceTiming;
          const resourceLoadTime = resourceEntry.responseEnd - entry.startTime;
          recordInteraction(`image_load_${imageName}`, resourceLoadTime);
        }
      },
      onError: (event: React.SyntheticEvent<HTMLImageElement>) => {
        const img = event.currentTarget;
        recordError(new Error(`Image load failed: ${img.src}`), {
          resourceType: 'image',
          resourceName: imageName,
          src: img.src
        });
      }
    };
  }, []);

  // 监控脚本加载性能
  const trackScriptLoad = useCallback((scriptName: string, src: string) => {
    const startTime = performance.now();
    
    return {
      onLoad: () => {
        const loadTime = performance.now() - startTime;
        recordInteraction(`script_load_${scriptName}`, loadTime);
      },
      onError: () => {
        recordError(new Error(`Script load failed: ${src}`), {
          resourceType: 'script',
          resourceName: scriptName,
          src
        });
      }
    };
  }, []);

  return {
    trackImageLoad,
    trackScriptLoad
  };
}

/**
 * 内存使用监控Hook
 */
export function useMemoryMonitoring(componentName: string) {
  const memoryCheckInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 定期检查内存使用情况
    memoryCheckInterval.current = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const memoryUsage = {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit
        };

        // 如果内存使用超过80%，记录警告
        const usagePercentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
        if (usagePercentage > 80) {
          recordError(new Error(`High memory usage detected: ${usagePercentage.toFixed(2)}%`), {
            component: componentName,
            memoryUsage,
            usagePercentage
          });
        }
      }
    }, 10000); // 每10秒检查一次

    return () => {
      if (memoryCheckInterval.current) {
        clearInterval(memoryCheckInterval.current);
      }
    };
  }, [componentName]);

  // 手动检查内存使用
  const checkMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usagePercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
      };
    }
    return null;
  }, []);

  return {
    checkMemoryUsage
  };
}

/**
 * 综合性能监控Hook
 * 结合多种监控功能的综合Hook
 */
export function usePerformanceMonitoring(componentName: string) {
  const componentPerf = useComponentPerformance(componentName);
  const interactionPerf = useInteractionPerformance();
  const errorMonitoring = useErrorMonitoring(componentName);
  const resourcePerf = useResourcePerformance();
  const memoryMonitoring = useMemoryMonitoring(componentName);

  // 获取性能摘要
  const getPerformanceSummary = useCallback(() => {
    return performanceMonitor.getPerformanceSummary();
  }, []);

  return {
    // 组件性能
    ...componentPerf,
    
    // 交互性能
    ...interactionPerf,
    
    // 错误监控
    ...errorMonitoring,
    
    // 资源性能
    ...resourcePerf,
    
    // 内存监控
    ...memoryMonitoring,
    
    // 性能摘要
    getPerformanceSummary
  };
}
