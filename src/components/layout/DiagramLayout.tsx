// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layout, theme, Button, ConfigProvider } from 'antd';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { ModernTopToolbar } from '../ui/ModernTopToolbar';
import { TopToolbarProps } from '../ui/TopToolbar';
import ModernDiagramMenu from '../ModernDiagramMenu';
import { ModernFlowchartSidebar } from '@/core';
import { DiagramDefinition } from '@/core';
import { diagramConfigManager } from '@/core';

const { Header, Sider, Content } = Layout;

interface DiagramLayoutProps {
  // Toolbar Props
  toolbarProps?: TopToolbarProps;
  header?: React.ReactNode;

  // Menu Props (Left Sider)
  showMenu?: boolean;
  menuProps?: {
    diagrams: DiagramDefinition[];
    selectedDiagramId: string;
    onSelectDiagram: (id: string) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
  };

  // Sidebar Props (Right Sider - optional/contextual)
  // For now, let's assume we might want a right sidebar for tools or properties
  // But based on current DiagramViewer, the flowchart sidebar is likely on the left or integrated
  // Let's keep it flexible. If we want the flowchart sidebar, we can pass it here.
  showFlowchartSidebar?: boolean;
  flowchartSidebarProps?: {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
  };

  contentStyle?: React.CSSProperties;
  isPresentationMode?: boolean;
  children: React.ReactNode;
}

export const DiagramLayout: React.FC<DiagramLayoutProps> = ({
  toolbarProps,
  header,
  menuProps,
  showMenu = true,
  showFlowchartSidebar = false,
  flowchartSidebarProps,
  contentStyle,
  isPresentationMode = false,
  children
}) => {
  const { token } = theme.useToken();

  const uiScale = React.useMemo(() => {
    try {
      const qs = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const urlScale = parseFloat(qs.get('uiScale') || '');
      if (!isNaN(urlScale) && urlScale > 0.3 && urlScale <= 3) return urlScale;
      return diagramConfigManager.getConfig().ui?.scale ?? 1.0;
    } catch { return 1.0; }
  }, []);

  const [menuWidth, setMenuWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('layout.menuWidth');
      const v = raw ? Number(raw) : 304;
      return Number.isFinite(v) ? v : 304;
    } catch {
      return 304;
    }
  });
  const [flowSidebarWidth, setFlowSidebarWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('layout.flowSidebarWidth');
      const v = raw ? Number(raw) : 260;
      return Number.isFinite(v) ? v : 260;
    } catch {
      return 260;
    }
  });

  useEffect(() => {
    try { localStorage.setItem('layout.menuWidth', String(menuWidth)); } catch { void 0; }
  }, [menuWidth]);
  useEffect(() => {
    try { localStorage.setItem('layout.flowSidebarWidth', String(flowSidebarWidth)); } catch { void 0; }
  }, [flowSidebarWidth]);

  const dragRef = useRef<null | { kind: 'menu' | 'flow'; startX: number; startWidth: number }>(null);

  const onDragMove = useCallback((ev: MouseEvent) => {
    const st = dragRef.current;
    if (!st) return;
    const dx = ev.clientX - st.startX;
    if (st.kind === 'menu') {
      const next = Math.max(220, Math.min(520, st.startWidth + dx));
      setMenuWidth(next);
      return;
    }
    const next = Math.max(200, Math.min(520, st.startWidth + dx));
    setFlowSidebarWidth(next);
  }, []);

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onDragMove);
  }, [onDragMove]);

  useEffect(() => {
    return () => {
      try { window.removeEventListener('mousemove', onDragMove); } catch { void 0; }
      try { window.removeEventListener('mouseup', stopDrag); } catch { void 0; }
    };
  }, [onDragMove, stopDrag]);

  const startDragMenu = useCallback((e: React.MouseEvent) => {
    if (!menuProps) return;
    if (menuProps.isCollapsed) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind: 'menu', startX: e.clientX, startWidth: menuWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onDragMove);
    try {
      window.addEventListener('mouseup', stopDrag, { once: true });
    } catch {
      window.addEventListener('mouseup', stopDrag);
    }
  }, [menuProps, menuWidth, onDragMove, stopDrag]);

  const startDragFlow = useCallback((e: React.MouseEvent) => {
    if (!showFlowchartSidebar || !flowchartSidebarProps || flowchartSidebarProps.isCollapsed) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind: 'flow', startX: e.clientX, startWidth: flowSidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onDragMove);
    try {
      window.addEventListener('mouseup', stopDrag, { once: true });
    } catch {
      window.addEventListener('mouseup', stopDrag);
    }
  }, [flowchartSidebarProps, flowSidebarWidth, onDragMove, showFlowchartSidebar, stopDrag]);

  useEffect(() => {
    if (isPresentationMode || !showMenu || !menuProps) {
      document.documentElement.style.setProperty('--left-sidebar-offset', '0px');
      document.documentElement.style.setProperty('--max-sidebar-offset', '0px');
      return;
    }
    
    const isCollapsed = menuProps.isCollapsed;
    const leftOffset = isCollapsed ? 64 + 16 : menuWidth + 16;
    
    const rightSidebarVisible = localStorage.getItem('designer.rightSidebar.visible') !== 'false';
    const rightSidebarWidth = parseInt(localStorage.getItem('designer.rightSidebar.width') || '360', 10);
    const rightOffset = rightSidebarVisible ? rightSidebarWidth + 16 : 0;
    
    const maxOffset = Math.max(leftOffset, rightOffset);
    
    document.documentElement.style.setProperty('--left-sidebar-offset', `${leftOffset}px`);
    document.documentElement.style.setProperty('--max-sidebar-offset', `${maxOffset}px`);
  }, [menuProps?.isCollapsed, menuWidth, showMenu, isPresentationMode]);

  return (
    <ConfigProvider
      getPopupContainer={(node) => {
        if (node) {
          const layoutRoot = node.closest('#app-root-layout') as HTMLElement;
          if (layoutRoot) return layoutRoot;
        }
        return document.getElementById('app-root-layout') || document.body;
      }}
      theme={{
        token: {
          fontSize: Math.max(12, Math.floor(14 * uiScale)),
          controlHeight: Math.floor(32 * uiScale),
          controlHeightLG: Math.floor(40 * uiScale),
          controlHeightSM: Math.floor(24 * uiScale),
          padding: Math.floor(16 * uiScale),
          paddingLG: Math.floor(24 * uiScale),
          paddingSM: Math.floor(12 * uiScale),
          paddingXS: Math.floor(8 * uiScale),
          borderRadius: Math.floor(6 * uiScale),
        }
      }}
    >
      <Layout
        id="app-root-layout"
        style={{
          height: `${100 / uiScale}vh`,
          width: '100%',
          overflow: 'hidden',
          minHeight: 0,
          zoom: uiScale,
          transition: 'zoom 0.2s ease-out, height 0.2s ease-out, width 0.2s ease-out'
        }}
      >
        {!isPresentationMode && (
          <Header
            style={{
              padding: 0,
              height: 0, // Zero height so layout flex-1 takes full screen
              lineHeight: 'normal',
              background: 'transparent', // Transparent to let the canvas show through
              zIndex: 1000,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              pointerEvents: 'none' // Important: let clicks pass through to canvas where there is no toolbar
            }}
          >
            {header ? header : (toolbarProps ? <ModernTopToolbar {...toolbarProps} /> : null)}
          </Header>
        )}
        <Layout style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
          {/* Left Sider: Diagram Menu */}
          {!isPresentationMode && showMenu && menuProps && (
            <>
              <Sider
                collapsible
                collapsed={menuProps.isCollapsed}
                onCollapse={(collapsed) => {
                  if (collapsed !== menuProps.isCollapsed) {
                    menuProps.onToggleCollapse();
                  }
                }}
                width={menuWidth}
                collapsedWidth={64}
                theme="light"
                style={{
                  margin: '16px 0 16px 16px',
                  height: 'calc(100% - 32px)',
                  borderRadius: '16px',
                  border: `1px solid var(--designer-border, rgba(255,255,255,0.45))`,
                  boxShadow: 'var(--designer-shadow, 0 24px 48px -12px rgba(0,0,0,0.15))',
                  backgroundColor: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.72))',
                  backdropFilter: 'var(--designer-blur, blur(24px) saturate(180%))',
                  WebkitBackdropFilter: 'var(--designer-blur, blur(24px) saturate(180%))',
                  zIndex: 9,
                  overflow: 'hidden'
                }}
                trigger={null}
              >
                <ModernDiagramMenu
                  diagrams={menuProps.diagrams}
                  selectedDiagram={menuProps.selectedDiagramId}
                  onSelectDiagram={menuProps.onSelectDiagram}
                  isCollapsed={menuProps.isCollapsed}
                  onToggleCollapse={menuProps.onToggleCollapse}
                />
              </Sider>
              <div
                role="separator"
                onMouseDown={menuProps.isCollapsed ? undefined : startDragMenu}
                onClick={(e) => {
                  if (menuProps.isCollapsed) {
                    e.preventDefault();
                    e.stopPropagation();
                    menuProps.onToggleCollapse();
                  }
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  menuProps.onToggleCollapse();
                }}
                style={{
                  width: 16,
                  cursor: menuProps.isCollapsed ? 'pointer' : 'col-resize',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 20,
                  overflow: 'visible'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    padding: 2,
                    borderRadius: 999,
                    background: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.72))',
                    backdropFilter: 'var(--designer-blur, blur(24px) saturate(180%))',
                    border: `1px solid var(--designer-border, rgba(255,255,255,0.45))`,
                    boxShadow: 'var(--designer-shadow, 0 24px 48px -12px rgba(0,0,0,0.15))',
                    zIndex: 21,
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={menuProps.isCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      menuProps.onToggleCollapse();
                    }}
                    style={{ width: 26, height: 26 }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Optional Secondary Sider (Flowchart Tools) */}
          {!isPresentationMode && showFlowchartSidebar && flowchartSidebarProps && (
            <>
              <ModernFlowchartSidebar
                isCollapsed={flowchartSidebarProps.isCollapsed}
                onToggleCollapse={flowchartSidebarProps.onToggleCollapse}
                width={flowSidebarWidth}
                collapsedWidth={56}
              />
              <div
                role="separator"
                onMouseDown={flowchartSidebarProps.isCollapsed ? undefined : startDragFlow}
                onClick={(e) => {
                  if (flowchartSidebarProps.isCollapsed) {
                    e.preventDefault();
                    e.stopPropagation();
                    flowchartSidebarProps.onToggleCollapse();
                  }
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  flowchartSidebarProps.onToggleCollapse();
                }}
                style={{
                  width: 16,
                  cursor: flowchartSidebarProps.isCollapsed ? 'pointer' : 'col-resize',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 20,
                  overflow: 'visible'
                }}
              >
                {/* No solid vertical line anymore, just the floating handle */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    padding: 2,
                    borderRadius: 999,
                    background: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.72))',
                    backdropFilter: 'var(--designer-blur, blur(24px) saturate(180%))',
                    border: `1px solid var(--designer-border, rgba(255,255,255,0.45))`,
                    boxShadow: 'var(--designer-shadow, 0 24px 48px -12px rgba(0,0,0,0.15))',
                    zIndex: 21,
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  title={flowchartSidebarProps.isCollapsed ? '展开右侧工具栏' : '收起右侧工具栏'}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={flowchartSidebarProps.isCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      flowchartSidebarProps.onToggleCollapse();
                    }}
                    aria-label={flowchartSidebarProps.isCollapsed ? '展开右侧工具栏' : '收起右侧工具栏'}
                    style={{ width: 26, height: 26 }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Main Content */}
          <Content style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden', minHeight: 0, ...contentStyle }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
