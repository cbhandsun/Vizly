import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  calculateTooltipPosition,
  normalizeTooltipDelay,
  type TooltipPosition,
} from './tooltipPosition';

/**
 * Tooltip 组件
 */
export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  delay?: number;
}

const getTooltipMountTarget = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  return (
    (document.fullscreenElement as HTMLElement | null) ||
    (document.querySelector('.modal-overlay.visible') as HTMLElement | null) ||
    document.body
  );
};

const Tooltip: React.FC<TooltipProps> = ({ content, children, delay = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeDelay = normalizeTooltipDelay(delay);

  const clearTimers = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const calculatePosition = (target: HTMLElement): TooltipPosition => {
    const rect = target.getBoundingClientRect();
    const viewportWidth = typeof window === 'undefined' ? 250 : window.innerWidth;
    return calculateTooltipPosition(rect, viewportWidth);
  };

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (isVisible || showTimer.current) return;

    const target = e.currentTarget;
    if (safeDelay <= 0) {
      setPosition(calculatePosition(target));
      setIsVisible(true);
      return;
    }

    showTimer.current = setTimeout(() => {
      setPosition(calculatePosition(target));
      setIsVisible(true);
      showTimer.current = null;
    }, safeDelay);
  }, [isVisible, safeDelay]);

  const handleMouseLeave = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) return;

    hideTimer.current = setTimeout(() => {
      setIsVisible(false);
      hideTimer.current = null;
    }, 300);
  }, []);

  const onTooltipMouseEnter = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const onTooltipMouseLeave = useCallback(() => {
    handleMouseLeave();
  }, [handleMouseLeave]);

  const mountTarget = getTooltipMountTarget();

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-block', verticalAlign: 'middle', cursor: 'default' }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {children}
        </span>
      </span>
      {isVisible && mountTarget && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed bg-[#333]/95 text-white py-2 px-3 rounded text-[13px] z-[999999] pointer-events-auto whitespace-pre-wrap max-w-[300px] shadow-lg leading-relaxed border border-white/15 transition-opacity duration-100 ${isVisible ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
          style={{ left: position.x, top: position.y }}
          onMouseEnter={onTooltipMouseEnter}
          onMouseLeave={onTooltipMouseLeave}
        >
          {content}
        </div>,
        mountTarget
      )}
    </>
  );
};

export default Tooltip;
