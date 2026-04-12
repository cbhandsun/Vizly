// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip 组件
 */
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  delay?: number;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, delay = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<NodeJS.Timeout | null>(null);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const calculatePosition = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    let x = rect.right + 10;
    let y = rect.top;

    const viewportWidth = window.innerWidth;
    const estimatedWidth = 250;

    if (x + estimatedWidth > viewportWidth) {
      const leftAttempt = rect.left - estimatedWidth - 10;
      if (leftAttempt > 0) {
        x = leftAttempt;
      } else {
        x = rect.left;
        y = rect.bottom + 10;
      }
    }
    return { x, y };
  };

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (isVisible || showTimer.current) return;

    const target = e.currentTarget as HTMLElement;
    if (delay <= 0) {
      setPosition(calculatePosition(target));
      setIsVisible(true);
      return;
    }

    showTimer.current = setTimeout(() => {
      setPosition(calculatePosition(target));
      setIsVisible(true);
      showTimer.current = null;
    }, delay);
  }, [delay, isVisible]);

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

  const onTooltipMouseEnter = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const onTooltipMouseLeave = () => {
    handleMouseLeave();
  };

  const mountTarget = (
    (document.fullscreenElement as HTMLElement | null) ||
    (document.querySelector('.modal-overlay.visible') as HTMLElement | null) ||
    document.body
  );

  return (
    <>
      <span
        ref={triggerRef as any}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-block', verticalAlign: 'middle', cursor: 'default' }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {children}
        </span>
      </span>
      {isVisible && createPortal(
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
