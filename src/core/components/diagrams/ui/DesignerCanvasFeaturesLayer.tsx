import React from 'react';

import { QuickConnectMenu } from '../QuickConnectMenu';
import { HoverToolbarsOverlay } from '../HoverToolbarsOverlay';
import { SmartGuideRenderer } from '../SmartGuideRenderer';
import { AnnotationLayer } from '../AnnotationLayer';
import { PageTabs } from '../PageTabs';
import { HistoryPanel } from '../HistoryPanel';
import { CanvasSearchBar } from '../CanvasSearchBar';
import { Node, Edge } from '@xyflow/react';
import { PluginContext } from '../../../types/plugin';

export interface DesignerCanvasFeaturesLayerProps {
    quickConnect: {
        visible: boolean;
        x: number;
        y: number;
        sourceNodeId?: string;
        onSelect: any;
        onClose: any;
        onPreview: any;
    };

    hoverToolbar: {
        nodeTypes: Record<string, React.ComponentType<any>>;
        pluginCtx: PluginContext;
        activePlugin: any;
        quickAddMenuVisible: boolean;
        isContextToolbarHidden: boolean;
        isConnecting: boolean;
        updateNodesBatch: any;
        updateEdgesBatch: any;
        onUpdateNodes: any;
        handleDeleteWithToast: any;
        handleDuplicateWithToast: any;
        handleLock: any;
        handleOpacity: any;
        handleBringToFront: any;
        handleSendToBack: any;
        copyStyle: any;
        pasteStyle: any;
        hasCopiedStyle: boolean;
    };

    smartGuides: {
        guides: any[];
    };

    annotations: {
        items: any[];
        mode: boolean;
        onAdd: (ann: any) => void;
        onUpdate: (id: string, updates: any) => void;
        onDelete: (id: string) => void;
        onToggleResolved: (id: string) => void;
        activePageId: string;
        colors: string[];
    };

    pages: {
        items: any[];
        activePageId: string;
        onSwitchPage: (id: string) => void;
        onAddPage: () => void;
        onDeletePage: (id: string) => void;
        onRenamePage: (id: string, name: string) => void;
    };

    history: {
        visible: boolean;
        onClose: () => void;
        pastEntries: any[];
        canUndo: boolean;
        canRedo: boolean;
        onUndo: () => void;
        onRedo: () => void;
        onJumpTo: (index: number) => void;
    };

    search: {
        visible: boolean;
        onClose: () => void;
        nodes: Node[];
        onHighlightNode: (id: string | null) => void;
        onReplaceNode?: (nodeId: string, newLabel: string) => void;
        onReplaceAll?: (matchIds: string[], newLabel: string) => void;
        onBeforeReplace?: () => void;
    };
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
