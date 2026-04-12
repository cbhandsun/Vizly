/**
 * 可访问性工具集
 * 提供无障碍功能支持
 */

import { useEffect, useRef, useCallback } from 'react';

// ARIA角色定义
export const ARIA_ROLES = {
  DIAGRAM: 'img',
  NAVIGATION: 'navigation',
  BUTTON: 'button',
  MENU: 'menu',
  MENUITEM: 'menuitem',
  TOOLBAR: 'toolbar',
  REGION: 'region',
  COMPLEMENTARY: 'complementary',
  MAIN: 'main'
} as const;

// 键盘导航键码
export const KEYBOARD_KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  TAB: 'Tab',
  HOME: 'Home',
  END: 'End'
} as const;

/**
 * 焦点管理Hook
 * 用于管理组件内的焦点状态
 */
export const useFocusManagement = () => {
  const focusableElementsRef = useRef<HTMLElement[]>([]);
  const currentFocusIndexRef = useRef<number>(-1);

  const updateFocusableElements = useCallback((container: HTMLElement) => {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    focusableElementsRef.current = Array.from(
      container.querySelectorAll(focusableSelectors)
    ) as HTMLElement[];
  }, []);

  const focusFirst = useCallback(() => {
    if (focusableElementsRef.current.length > 0) {
      focusableElementsRef.current[0].focus();
      currentFocusIndexRef.current = 0;
    }
  }, []);

  const focusLast = useCallback(() => {
    const elements = focusableElementsRef.current;
    if (elements.length > 0) {
      elements[elements.length - 1].focus();
      currentFocusIndexRef.current = elements.length - 1;
    }
  }, []);

  const focusNext = useCallback(() => {
    const elements = focusableElementsRef.current;
    if (elements.length === 0) return;

    currentFocusIndexRef.current = (currentFocusIndexRef.current + 1) % elements.length;
    elements[currentFocusIndexRef.current].focus();
  }, []);

  const focusPrevious = useCallback(() => {
    const elements = focusableElementsRef.current;
    if (elements.length === 0) return;

    currentFocusIndexRef.current = 
      currentFocusIndexRef.current <= 0 
        ? elements.length - 1 
        : currentFocusIndexRef.current - 1;
    elements[currentFocusIndexRef.current].focus();
  }, []);

  return {
    updateFocusableElements,
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious
  };
};

/**
 * 键盘导航Hook
 * 处理键盘事件和导航逻辑
 */
export const useKeyboardNavigation = (
  containerRef: React.RefObject<HTMLElement>,
  options: {
    onEscape?: () => void;
    onEnter?: () => void;
    enableArrowKeys?: boolean;
    enableTabTrapping?: boolean;
  } = {}
) => {
  const { updateFocusableElements, focusFirst, focusLast, focusNext, focusPrevious } = useFocusManagement();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateFocusableElements(container);

    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, shiftKey } = event;

      switch (key) {
        case KEYBOARD_KEYS.ESCAPE:
          if (options.onEscape) {
            event.preventDefault();
            options.onEscape();
          }
          break;

        case KEYBOARD_KEYS.ENTER:
        case KEYBOARD_KEYS.SPACE:
          if (options.onEnter && event.target === container) {
            event.preventDefault();
            options.onEnter();
          }
          break;

        case KEYBOARD_KEYS.TAB:
          if (options.enableTabTrapping) {
            if (shiftKey) {
              // Shift+Tab - 向前导航
              if (document.activeElement === container.querySelector('[tabindex]:first-child')) {
                event.preventDefault();
                focusLast();
              }
            } else {
              // Tab - 向后导航
              if (document.activeElement === container.querySelector('[tabindex]:last-child')) {
                event.preventDefault();
                focusFirst();
              }
            }
          }
          break;

        case KEYBOARD_KEYS.ARROW_UP:
        case KEYBOARD_KEYS.ARROW_LEFT:
          if (options.enableArrowKeys) {
            event.preventDefault();
            focusPrevious();
          }
          break;

        case KEYBOARD_KEYS.ARROW_DOWN:
        case KEYBOARD_KEYS.ARROW_RIGHT:
          if (options.enableArrowKeys) {
            event.preventDefault();
            focusNext();
          }
          break;

        case KEYBOARD_KEYS.HOME:
          if (options.enableArrowKeys) {
            event.preventDefault();
            focusFirst();
          }
          break;

        case KEYBOARD_KEYS.END:
          if (options.enableArrowKeys) {
            event.preventDefault();
            focusLast();
          }
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, options, updateFocusableElements, focusFirst, focusLast, focusNext, focusPrevious]);
};

/**
 * 屏幕阅读器公告Hook
 * 用于向屏幕阅读器用户提供实时反馈
 */
export const useScreenReaderAnnouncement = () => {
  const announcementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 创建隐藏的公告区域
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.position = 'absolute';
    announcement.style.left = '-10000px';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';
    
    document.body.appendChild(announcement);
    announcementRef.current = announcement;

    return () => {
      if (announcementRef.current) {
        document.body.removeChild(announcementRef.current);
      }
    };
  }, []);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announcementRef.current) {
      announcementRef.current.setAttribute('aria-live', priority);
      announcementRef.current.textContent = message;
      
      // 清除消息以允许重复公告
      setTimeout(() => {
        if (announcementRef.current) {
          announcementRef.current.textContent = '';
        }
      }, 1000);
    }
  }, []);

  return { announce };
};

/**
 * 高对比度检测Hook
 * 检测用户是否启用了高对比度模式
 */
export const useHighContrast = () => {
  const [isHighContrast, setIsHighContrast] = React.useState(() => {
    const isWindowsHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
    const isMediaQueryHighContrast = window.matchMedia('(-ms-high-contrast: active)').matches;
    return isWindowsHighContrast || isMediaQueryHighContrast;
  });

  useEffect(() => {
    const checkHighContrast = () => {
      const isWindowsHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
      const isMediaQueryHighContrast = window.matchMedia('(-ms-high-contrast: active)').matches;
      setIsHighContrast(isWindowsHighContrast || isMediaQueryHighContrast);
    };

    // 监听变化
    const contrastQuery = window.matchMedia('(prefers-contrast: high)');
    const msContrastQuery = window.matchMedia('(-ms-high-contrast: active)');
    
    contrastQuery.addEventListener('change', checkHighContrast);
    msContrastQuery.addEventListener('change', checkHighContrast);

    return () => {
      contrastQuery.removeEventListener('change', checkHighContrast);
      msContrastQuery.removeEventListener('change', checkHighContrast);
    };
  }, []);

  return isHighContrast;
};

/**
 * 减少动画检测Hook
 * 检测用户是否偏好减少动画
 */
export const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() => 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
};

/**
 * 生成可访问的描述文本
 * 为图表元素生成屏幕阅读器友好的描述
 */
export const generateAccessibleDescription = (
  element: {
    type: 'node' | 'edge' | 'group';
    label: string;
    position?: { x: number; y: number };
    connections?: string[];
    groupInfo?: { parent: string; children: string[] };
  }
): string => {
  const { type, label, position, connections, groupInfo } = element;

  let description = `${type === 'node' ? '节点' : type === 'edge' ? '连接线' : '组'}: ${label}`;

  if (position) {
    description += `，位置: x=${Math.round(position.x)}, y=${Math.round(position.y)}`;
  }

  if (connections && connections.length > 0) {
    description += `，连接到: ${connections.join(', ')}`;
  }

  if (groupInfo) {
    if (groupInfo.parent) {
      description += `，属于组: ${groupInfo.parent}`;
    }
    if (groupInfo.children.length > 0) {
      description += `，包含: ${groupInfo.children.join(', ')}`;
    }
  }

  return description;
};

/**
 * 创建可访问的快捷键提示
 */
export const createKeyboardShortcutHint = (shortcuts: Record<string, string>): string => {
  const hints = Object.entries(shortcuts).map(([key, action]) => `${key}: ${action}`);
  return `键盘快捷键: ${hints.join(', ')}`;
};

// React导入（用于Hook）
import React from 'react';
