import { useEffect } from 'react';
import type { Node } from '@xyflow/react';
import { diagramConfigManager } from '@/core/config/DiagramConfig';
import { LayeredConfigManager } from '../../../../config/LayeredConfigManager';
import { calcNodeSignature } from './useDiagramStability';

export interface DiagramContainerClampParams {
  rfNodes: Node[];
  setRfNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}

export function useDiagramContainerClamp({ rfNodes, setRfNodes }: DiagramContainerClampParams) {
  useEffect(() => {
    try {
      const cfg = (diagramConfigManager.getLayoutConfig() ?? {}) as unknown as Record<string, unknown>;
      const fullCfg = (diagramConfigManager.getConfig() ?? {}) as unknown as Record<string, unknown>;
      const toNum = (v: unknown, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

      const domainCfg = (fullCfg['domain'] ?? {}) as Record<string, unknown>;
      const domainPadding = (domainCfg['padding'] ?? {}) as Record<string, unknown>;
      const domainTitle = (domainCfg['title'] ?? {}) as Record<string, unknown>;

      const padH = toNum(domainPadding['horizontal'], 24);
      const titleH = toNum(domainTitle['height'], 40);
      const titleVPad = toNum(domainTitle['padding'] && typeof domainTitle['padding'] === 'object'
        ? (domainTitle['padding'] as Record<string, unknown>)['vertical']
        : undefined, 12);
      const titleSafe = toNum(domainTitle['safeGap'], 16);
      const bottomSafe = toNum(domainCfg['bottomSafeGap'], titleVPad + titleSafe);
      const EXCLUDE = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'swimlane']);

      const next = rfNodes.map(n => ({ ...n }));
      const layoutNodeMinWidth = toNum(cfg['NODE_MIN_WIDTH'], 240);
      const getW = (n: Node) => toNum(n.style?.width ?? n.measured?.width ?? n.width, layoutNodeMinWidth);
      const getH = (n: Node) => toNum(n.measured?.height ?? n.style?.height ?? n.height, 80);
      const getData = (n: Node) => (n.data ?? {}) as Record<string, unknown>;

      const domainMap = new Map<string, Node[]>();
      const titleGroups: Node[] = [];

      for (const n of next) {
        const t = String(n.type || '');
        if (t === 'titleGroup') {
          titleGroups.push(n);
        } else if (!EXCLUDE.has(t) || t === 'subGroup') {
          const dId = String(getData(n).domain ?? '');
          if (dId) {
            let list = domainMap.get(dId);
            if (!list) {
              list = [];
              domainMap.set(dId, list);
            }
            list.push(n);
          }
        }
      }

      for (const dc of titleGroups) {
        const dId = String(getData(dc).domain ?? '');
        if (!dId) continue;

        const content = domainMap.get(dId);
        if (!content || !content.length) continue;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of content) {
          const x = toNum(n.position?.x, 0);
          const y = toNum(n.position?.y, 0);
          const w = getW(n);
          const h = getH(n);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
        }

        const width = Math.max(0, maxX - minX) + padH * 2;
        const height = Math.max(titleH + titleVPad + titleSafe + bottomSafe, Math.max(0, maxY - minY) + titleH + titleVPad + titleSafe + bottomSafe);
        const y = minY - (titleH + titleVPad + titleSafe);

        const prevW = toNum(dc.style?.width ?? dc.measured?.width, 0);
        const prevH = toNum(dc.measured?.height ?? dc.style?.height, 0);
        const prevX = toNum(dc.position?.x, 0);
        const prevY = toNum(dc.position?.y, 0);

        const layered = LayeredConfigManager.getInstance();
        const updateW = Boolean(layered.get<boolean>('diagram.layout.view.updateDomainWidth', false));
        const updateH = Boolean(layered.get<boolean>('diagram.layout.view.updateDomainHeight', false));

        const idx = next.findIndex(item => item.id === dc.id);
        if (idx === -1) continue;

        // Note: x is not overwritten to preserve horizontal centering offsets
        if (updateW || updateH) {
          const nextW = updateW ? width : prevW;
          const nextH = updateH ? height : prevH;
          const nextPosX = prevX;
          const nextPosY = updateH ? y : prevY;

          if (prevW !== nextW || prevH !== nextH || prevY !== nextPosY) {
            next[idx] = {
              ...dc,
              position: { x: nextPosX, y: nextPosY },
              style: { ...(dc.style || {}), width: nextW, height: nextH },
              measured: { width: nextW, height: nextH }
            };
          }
        } else {
          if (prevH !== height || prevY !== y) {
            next[idx] = {
              ...dc,
              position: { x: prevX, y },
              style: { ...(dc.style || {}), height },
              measured: { width: prevW, height }
            };
          }
        }
      }

      if (calcNodeSignature(next) !== calcNodeSignature(rfNodes)) {
        Promise.resolve().then(() => setRfNodes(next));
      }
    } catch { void 0; }
  }, [rfNodes, setRfNodes]);
}
