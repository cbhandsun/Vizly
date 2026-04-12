/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 性能监控工具
 * 提供组件渲染性能监控和优化建议
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// 性能监控接口
interface PerformanceMetrics {
  componentName: string;
  renderTime: number;
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
}

// 全局性能监控存储
const performanceStore = new Map<string, PerformanceMetrics>();

/**
 * 组件渲染性能监控 Hook
 * @param componentName 组件名称
 * @param enabled 是否启用监控（生产环境建议关闭）
 */
export const usePerformanceMonitor = (
  componentName: string, 
  enabled: boolean = process.env.NODE_ENV === 'development'
) => {
  const renderStartTime = useRef<number>(0);
  const renderCount = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    renderStartTime.current = performance.now();
    renderCount.current += 1;

    return () => {
      const renderTime = performance.now() - renderStartTime.current;
      
      // 更新性能指标
      const existing = performanceStore.get(componentName);
      const metrics: PerformanceMetrics = {
        componentName,
        renderTime,
        renderCount: renderCount.current,
        lastRenderTime: renderTime,
        averageRenderTime: existing 
          ? (existing.averageRenderTime * (existing.renderCount - 1) + renderTime) / existing.renderCount
          : renderTime
      };
      
      performanceStore.set(componentName, metrics);

      // 性能警告
      if (renderTime > 16) { // 超过一帧时间
        console.warn(`🐌 ${componentName} 渲染耗时 ${renderTime.toFixed(2)}ms，可能影响用户体验`);
      }
    };
  });

  return {
    getMetrics: () => performanceStore.get(componentName),
    getAllMetrics: () => Array.from(performanceStore.values()),
  };
};

/**
 * 内存使用监控
 */
export const useMemoryMonitor = (enabled: boolean = process.env.NODE_ENV === 'development') => {
  const checkMemory = useCallback(() => {
    if (!enabled || !('memory' in performance)) return null;

    const memory = (performance as any).memory;
    return {
      used: Math.round(memory.usedJSHeapSize / 1048576), // MB
      total: Math.round(memory.totalJSHeapSize / 1048576), // MB
      limit: Math.round(memory.jsHeapSizeLimit / 1048576), // MB
      usage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100) // %
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const memory = checkMemory();
      if (memory && memory.usage > 80) {
        console.warn(`🚨 内存使用率过高: ${memory.usage}% (${memory.used}MB/${memory.limit}MB)`);
      }
    }, 10000); // 每10秒检查一次

    return () => clearInterval(interval);
  }, [enabled, checkMemory]);

  return { checkMemory };
};

/**
 * 防抖 Hook
 * @param callback 回调函数
 * @param delay 延迟时间（毫秒）
 */
export const useDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;
};

/**
 * 节流 Hook
 * @param callback 回调函数
 * @param delay 延迟时间（毫秒）
 */
export const useThrottle = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const lastCallTime = useRef<number>(0);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCallTime.current >= delay) {
      lastCallTime.current = now;
      callback(...args);
    }
  }, [callback, delay]) as T;
};

/**
 * 长列表虚拟化 Hook
 * @param items 列表项
 * @param itemHeight 每项高度
 * @param containerHeight 容器高度
 */
export const useVirtualList = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) => {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );

  const visibleItems = items.slice(startIndex, endIndex);
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    onScroll: (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
  };
};

/**
 * 获取性能报告
 */
export const getPerformanceReport = () => {
  const metrics = Array.from(performanceStore.values());
  
  return {
    totalComponents: metrics.length,
    slowComponents: metrics.filter(m => m.averageRenderTime > 16),
    fastestComponent: metrics.reduce((prev, curr) => 
      prev.averageRenderTime < curr.averageRenderTime ? prev : curr
    ),
    slowestComponent: metrics.reduce((prev, curr) => 
      prev.averageRenderTime > curr.averageRenderTime ? prev : curr
    ),
    averageRenderTime: metrics.reduce((sum, m) => sum + m.averageRenderTime, 0) / metrics.length,
    metrics,
  };
};

/**
 * 清理性能数据
 */
export const clearPerformanceData = () => {
  performanceStore.clear();
};

// 导出性能监控存储（用于调试）
export { performanceStore };
