import React from 'react';

import { QuickConnectMenu } from '../QuickConnectMenu';
import { HoverToolbarsOverlay } from '../HoverToolbarsOverlay';
import { SmartGuideRenderer } from '../SmartGuideRenderer';
import { AnnotationLayer } from '../AnnotationLayer';
import { PageTabs } from '../PageTabs';
import { HistoryPanel } from '../HistoryPanel';
import { CanvasSearchBar } from '../CanvasSearchBar';

type QuickConnectProps = React.ComponentProps<typeof QuickConnectMenu>;
type HoverToolbarProps = React.ComponentProps<typeof HoverToolbarsOverlay>;
type SmartGuideProps = React.ComponentProps<typeof SmartGuideRenderer>;
type AnnotationProps = React.ComponentProps<typeof AnnotationLayer>;
type PageTabsProps = React.ComponentProps<typeof PageTabs>;
type HistoryProps = React.ComponentProps<typeof HistoryPanel>;
type SearchProps = React.ComponentProps<typeof CanvasSearchBar>;

export interface DesignerCanvasFeaturesLayerProps {
    quickConnect: Pick<
        QuickConnectProps,
        'visible' | 'x' | 'y' | 'sourceNodeId' | 'onSelect' | 'onClose' | 'onPreview'
    >;

    hoverToolbar: Pick<
        HoverToolbarProps,
        | 'nodeTypes'
        | 'pluginCtx'
        | 'activePlugin'
        | 'quickAddMenuVisible'
        | 'isContextToolbarHidden'
        | 'isDragging'
        | 'isConnecting'
        | 'updateNodesBatch'
        | 'updateEdgesBatch'
        | 'onUpdateNodes'
        | 'handleDeleteWithToast'
        | 'handleDuplicateWithToast'
        | 'handleLock'
        | 'handleOpacity'
        | 'handleBringToFront'
        | 'handleSendToBack'
        | 'copyStyle'
        | 'pasteStyle'
        | 'hasCopiedStyle'
    >;

    smartGuides: Pick<SmartGuideProps, 'guides'>;

    annotations: {
        items: AnnotationProps['annotations'];
        mode: AnnotationProps['annotationMode'];
        onAdd: AnnotationProps['onAdd'];
        onUpdate: AnnotationProps['onUpdate'];
        onDelete: AnnotationProps['onDelete'];
        onToggleResolved: AnnotationProps['onToggleResolved'];
        activePageId: AnnotationProps['activePageId'];
        colors: AnnotationProps['colors'];
    };

    pages: {
        items: PageTabsProps['pages'];
        activePageId: PageTabsProps['activePageId'];
        onSwitchPage: PageTabsProps['onSwitchPage'];
        onAddPage: PageTabsProps['onAddPage'];
        onDeletePage: PageTabsProps['onDeletePage'];
        onRenamePage: PageTabsProps['onRenamePage'];
    };

    history: Pick<
        HistoryProps,
        'visible' | 'onClose' | 'pastEntries' | 'canUndo' | 'canRedo' | 'onUndo' | 'onRedo' | 'onJumpTo'
    >;

    search: Pick<
        SearchProps,
        | 'visible'
        | 'onClose'
        | 'nodes'
        | 'onHighlightNode'
        | 'onReplaceNode'
        | 'onReplaceAll'
        | 'onBeforeReplace'
    >;
}

export const DesignerCanvasFeaturesLayer = React.memo(
  (props: DesignerCanvasFeaturesLayerProps) => {
    const { quickConnect, hoverToolbar, smartGuides, annotations, pages, history, search } = props;
    return (
        <>
            <QuickConnectMenu
                visible={quickConnect.visible}
                x={quickConnect.x}
                y={quickConnect.y}
                sourceNodeId={quickConnect.sourceNodeId}
                onSelect={quickConnect.onSelect}
                onClose={quickConnect.onClose}
                onPreview={quickConnect.onPreview}
            />
            
            <HoverToolbarsOverlay
                nodeTypes={hoverToolbar.nodeTypes}
                pluginCtx={hoverToolbar.pluginCtx}
                activePlugin={hoverToolbar.activePlugin}
                quickAddMenuVisible={hoverToolbar.quickAddMenuVisible}
                isContextToolbarHidden={hoverToolbar.isContextToolbarHidden}
                isDragging={hoverToolbar.isDragging}
                isConnecting={hoverToolbar.isConnecting}
                updateNodesBatch={hoverToolbar.updateNodesBatch}
                updateEdgesBatch={hoverToolbar.updateEdgesBatch}
                onUpdateNodes={hoverToolbar.onUpdateNodes}
                handleDeleteWithToast={hoverToolbar.handleDeleteWithToast}
                handleDuplicateWithToast={hoverToolbar.handleDuplicateWithToast}
                handleLock={hoverToolbar.handleLock}
                handleOpacity={hoverToolbar.handleOpacity}
                handleBringToFront={hoverToolbar.handleBringToFront}
                handleSendToBack={hoverToolbar.handleSendToBack}
                copyStyle={hoverToolbar.copyStyle}
                pasteStyle={hoverToolbar.pasteStyle}
                hasCopiedStyle={hoverToolbar.hasCopiedStyle}
            />
            
            <SmartGuideRenderer guides={smartGuides.guides} />
            
            <AnnotationLayer
                annotations={annotations.items}
                annotationMode={annotations.mode}
                onAdd={annotations.onAdd}
                onUpdate={annotations.onUpdate}
                onDelete={annotations.onDelete}
                onToggleResolved={annotations.onToggleResolved}
                colors={annotations.colors}
                activePageId={annotations.activePageId}
            />
            
            <PageTabs
                pages={pages.items}
                activePageId={pages.activePageId}
                onSwitchPage={pages.onSwitchPage}
                onAddPage={pages.onAddPage}
                onDeletePage={pages.onDeletePage}
                onRenamePage={pages.onRenamePage}
            />
            
            <HistoryPanel
                visible={history.visible}
                onClose={history.onClose}
                pastEntries={history.pastEntries}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.onUndo}
                onRedo={history.onRedo}
                onJumpTo={history.onJumpTo}
            />
            
            <CanvasSearchBar
                visible={search.visible}
                onClose={search.onClose}
                nodes={search.nodes}
                onHighlightNode={search.onHighlightNode}
                onReplaceNode={search.onReplaceNode}
                onReplaceAll={search.onReplaceAll}
                onBeforeReplace={search.onBeforeReplace}
            />
        </>
    );
  },
  (prev, next) => {
      // ⭐ 深度性能护盾：拦截所有的内联事件函数与非关键状态导致的 60FPS 重绘
      if (prev.quickConnect.visible !== next.quickConnect.visible) return false;
      if (prev.quickConnect.visible) {
          if (prev.quickConnect.x !== next.quickConnect.x || 
              prev.quickConnect.y !== next.quickConnect.y || 
              prev.quickConnect.sourceNodeId !== next.quickConnect.sourceNodeId) return false;
      }
      
      // smartGuides array reference changes 60fps if guides appear, otherwise it's empty []
      if (prev.smartGuides.guides !== next.smartGuides.guides) return false;

      // check primitive boolean states
      if (prev.hoverToolbar.quickAddMenuVisible !== next.hoverToolbar.quickAddMenuVisible ||
          prev.hoverToolbar.isContextToolbarHidden !== next.hoverToolbar.isContextToolbarHidden ||
          prev.hoverToolbar.isDragging !== next.hoverToolbar.isDragging ||
          prev.hoverToolbar.isConnecting !== next.hoverToolbar.isConnecting ||
          prev.hoverToolbar.hasCopiedStyle !== next.hoverToolbar.hasCopiedStyle) return false;
          
      if (prev.annotations.items !== next.annotations.items || 
          prev.annotations.mode !== next.annotations.mode || 
          prev.annotations.activePageId !== next.annotations.activePageId) return false;
          
      if (prev.pages.items !== next.pages.items || 
          prev.pages.activePageId !== next.pages.activePageId) return false;

      if (prev.history.visible !== next.history.visible) return false;
      if (prev.history.visible) {
          if (prev.history.pastEntries !== next.history.pastEntries || 
              prev.history.canUndo !== next.history.canUndo || 
              prev.history.canRedo !== next.history.canRedo) return false;
      }

      if (prev.search.visible !== next.search.visible) return false;
      if (prev.search.visible) {
          if (prev.search.nodes !== next.search.nodes) return false;
      }

      return true;
  }
);
