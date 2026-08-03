/**
 * PresentationMode — 全屏沉浸式演示模式
 *
 * 行业对标：Miro Lightbox + Lucidchart Spotlight
 * - 焦点节点: 发光呼吸灯 + 保持原色
 * - 非焦点节点: 淡化 + 灰度 + 微模糊
 * - 平滑 fitView 过渡
 * - 键盘/鼠标双导航
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';
import { PresentationSlide } from '../../hooks/usePresentationSlides';
import {
  buildPresentationEdgeSelector,
  buildPresentationNodeSelector,
} from './presentationSelectorSafety';
import './PresentationMode.css';

interface PresentationModeProps {
  slides: PresentationSlide[];
  onFocusNodes: (nodeIds: string[]) => void;
  onExit: () => void;
}

const PresentationMode: React.FC<PresentationModeProps> = ({ slides, onFocusNodes, onExit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const totalSlides = slides.length;
  const currentSlide = slides[currentIndex];

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    exitButtonRef.current?.focus();

    return () => {
      if (previouslyFocused?.isConnected && previouslyFocused !== document.body) {
        previouslyFocused.focus();
        return;
      }
    };
  }, []);

  // 聚焦当前 slide 的节点
  const focusCurrent = useCallback(() => {
    if (currentSlide) {
      onFocusNodes(currentSlide.nodeIds);
    }
  }, [currentSlide, onFocusNodes]);

  useEffect(() => { focusCurrent(); }, [focusCurrent]);

  const goNext = useCallback(() => {
    if (currentIndex < totalSlides - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, totalSlides]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  const handleExit = useCallback(() => {
    onExit();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>('[data-presentation-focus-return]')?.focus();
      });
    });
  }, [onExit]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const controls = Array.from(
          overlayRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
        );
        if (controls.length === 0) return;

        const firstControl = controls[0];
        const lastControl = controls[controls.length - 1];
        const activeElement = document.activeElement;
        const focusIsInside = activeElement instanceof HTMLElement
          && overlayRef.current?.contains(activeElement);

        if (!focusIsInside || (e.shiftKey && activeElement === firstControl)) {
          e.preventDefault();
          (e.shiftKey ? lastControl : firstControl).focus();
        } else if (!e.shiftKey && activeElement === lastControl) {
          e.preventDefault();
          firstControl.focus();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ':
          e.preventDefault(); goNext(); break;
        case 'ArrowLeft': case 'ArrowUp':
          e.preventDefault(); goPrev(); break;
        case 'Escape':
          e.preventDefault(); handleExit(); break;
        case 'Home':
          e.preventDefault(); setCurrentIndex(0); break;
        case 'End':
          e.preventDefault(); setCurrentIndex(totalSlides - 1); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, handleExit, totalSlides]);

  // 🎯 动态高亮：淡化非焦点 + 发光焦点（Lucidchart Spotlight 风格）
  const highlightCSS = useMemo(() => {
    if (!currentSlide) return '';
    const ids = currentSlide.nodeIds;
    const isOverview = currentIndex === 0 && ids.length > 3;

    // 全局概览：所有节点微微发光
    if (isOverview) {
      return `
        .react-flow__node {
          transition: opacity 0.8s ease, filter 0.8s ease, transform 0.8s ease !important;
        }
        .react-flow__edge {
          transition: opacity 0.8s ease !important;
        }
      `;
    }

    const containerIds = currentSlide.containerIds || [];
    const focusedContainer = ids.filter(id => containerIds.includes(id))
      .map(buildPresentationNodeSelector).join(',\n');
    const focusedNormal = ids.filter(id => !containerIds.includes(id))
      .map(buildPresentationNodeSelector).join(',\n');
      
    const focusedEdge = ids.map(buildPresentationEdgeSelector).join(',\n');

    return `
      /* 🔑 脉冲呼吸灯动画 */
      @keyframes presentationPulse {
        0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.35), 0 0 20px rgba(59, 130, 246, 0.15); }
        50%      { box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.5),  0 0 36px rgba(59, 130, 246, 0.3); }
      }

      /* 淡化所有节点 */
      .react-flow__node {
        opacity: 0.1 !important;
        filter: grayscale(90%) blur(1px) !important;
        transition: opacity 0.8s ease, filter 0.8s ease !important;
      }

      /* 淡化所有边 */
      .react-flow__edge {
        opacity: 0.05 !important;
        transition: opacity 0.8s ease !important;
      }

      ${focusedContainer ? `
      /* ⭐ 焦点容器节点：全亮 + 较低层级防止遮挡子节点 */
      ${focusedContainer} {
        opacity: 1 !important;
        filter: none !important;
        z-index: 10 !important;
      }
      ${focusedContainer} > div {
        animation: presentationPulse 2.5s ease-in-out infinite !important;
        border-radius: 8px;
      }
      ` : ''}

      ${focusedNormal ? `
      /* ⭐ 焦点普通子节点：全亮 + 最高层级 */
      ${focusedNormal} {
        opacity: 1 !important;
        filter: none !important;
        z-index: 100 !important;
      }
      ${focusedNormal} > div {
        animation: presentationPulse 2.5s ease-in-out infinite !important;
        border-radius: 8px;
      }
      ` : ''}

      /* 焦点相关边保持可见 */
      ${focusedEdge} {
        opacity: 0.8 !important;
      }
    `;
  }, [currentSlide, currentIndex]);

  if (!currentSlide) return null;

  const progress = totalSlides > 1 ? (currentIndex / (totalSlides - 1)) * 100 : 100;

  return (
    <div
      ref={overlayRef}
      className="presentation-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="演示模式"
    >
      <style>{highlightCSS}</style>

      {/* 顶部标题栏 */}
      <div className="presentation-header">
        <div className="presentation-badge">
          <span className="presentation-badge-dot" />
          演示中
        </div>
        <div className="presentation-title" aria-live="polite" aria-atomic="true">
          {currentSlide.title}
        </div>
        <div className="presentation-counter">
          {currentIndex + 1}<span className="presentation-counter-sep">/</span>{totalSlides}
        </div>
        <button
          ref={exitButtonRef}
          type="button"
          className="presentation-exit"
          onClick={handleExit}
          title="退出演示 (ESC)"
          aria-label="退出演示"
        >
          <FaTimes aria-hidden="true" />
        </button>
      </div>

      {/* 底部控制条 */}
      <div className="presentation-controls">
        <button
          type="button"
          className="presentation-nav-btn"
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="上一页"
        >
          <FaChevronLeft aria-hidden="true" />
        </button>

        <div
          className="presentation-progress-bar"
          role="progressbar"
          aria-label="演示进度"
          aria-valuemin={1}
          aria-valuemax={totalSlides}
          aria-valuenow={currentIndex + 1}
          aria-valuetext={`第 ${currentIndex + 1} 页，共 ${totalSlides} 页`}
        >
          <div className="presentation-progress-fill" style={{ width: `${progress}%` }} />
          {slides.map((_, i) => (
            <button
              type="button"
              key={i}
              className={`presentation-dot ${i === currentIndex ? 'active' : ''} ${i < currentIndex ? 'visited' : ''}`}
              onClick={() => setCurrentIndex(i)}
              title={slides[i].title}
              aria-label={`转到第 ${i + 1} 页：${slides[i].title}`}
              aria-current={i === currentIndex ? 'step' : undefined}
              style={{ left: `${totalSlides > 1 ? (i / (totalSlides - 1)) * 100 : 50}%` }}
            />
          ))}
        </div>

        <button
          type="button"
          className="presentation-nav-btn"
          onClick={goNext}
          disabled={currentIndex === totalSlides - 1}
          aria-label="下一页"
        >
          <FaChevronRight aria-hidden="true" />
        </button>
      </div>

      {/* 备注区域 */}
      <div className="presentation-notes">
        {currentSlide.notes && <div>{currentSlide.notes}</div>}
      </div>
    </div>
  );
};

export default PresentationMode;
