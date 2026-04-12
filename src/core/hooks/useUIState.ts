import { useState, useCallback, useEffect, RefObject } from 'react';

export const useUIState = (panelRef: RefObject<{ collapse?: () => void; expand?: () => void } | null>) => {
  const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !isMenuCollapsed;
    setIsMenuCollapsed(newCollapsed);
    setIsTransitioning(true);
    
    if (newCollapsed) {
      panelRef.current?.collapse?.();
    } else {
      panelRef.current?.expand?.();
    }
    
    try {
      localStorage.setItem('singleMenuCollapsed', String(newCollapsed));
    } catch (error) {
      console.warn(error);
    }
    
    setTimeout(() => setIsTransitioning(false), 300);
  }, [isMenuCollapsed, panelRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleToggleCollapse();
      }
    };
    
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleToggleCollapse]);

  useEffect(() => {
    // 同步浏览器全屏状态，确保 ESC 或系统操作时图标状态正确
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('singleMenuCollapsed');
      if (stored === 'true') {
        requestAnimationFrame(() => {
          setIsMenuCollapsed(true);
          panelRef.current?.collapse?.();
        });
      }
    } catch (error) {
      console.warn(error);
    }
  }, [panelRef]);

  return { 
    isMenuCollapsed, 
    isTransitioning, 
    isFullscreen, 
    handleToggleCollapse, 
    handleToggleFullscreen,
    setCollapsed: (collapsed: boolean) => {
      setIsMenuCollapsed(collapsed);
      try {
        localStorage.setItem('singleMenuCollapsed', String(collapsed));
      } catch (error) {
        console.warn(error);
      }
    }
  };
};
