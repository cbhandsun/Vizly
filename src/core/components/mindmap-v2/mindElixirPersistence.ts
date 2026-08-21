import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';
import type { Edge, Node } from '@xyflow/react';
import i18n from '@/i18n';

import type { PluginContext } from '../../types/plugin';
import {
  createPageContentMetrics,
  PRESERVE_PAGE_COPY_NODE_ID,
} from '../diagrams/pageCanvasMetadata';
import { coerceMindElixirDirection, type MindElixirDirection } from './mindElixirDirection';
import { countNodes, directionStringToInt, migrateV1ToV2 } from './migrate';
import { createSafeMindMapV2Payload } from './mindmapPersistenceSecurity';
import { persistMindMapThemeKey, resolveMindMapThemeKey } from './mindmapThemeStorage';
import { logMindmapWrapperSaveFailure } from './mindmapWrapperLogging';
import { VIZLY_HYPER_THEME } from './theme';
import { isMindMapV2 } from './types';
import { cleanMindMapData, cleanMindMapTopic } from './mindmapTreeSanitizer';

const DEFAULT_DIRECTION = 2 as const;
const MINDMAP_META_NODE_ID = '__mindmap_meta__';

const DEFAULT_ROOT_TOPIC_KEY = 'designer.mindMapCenter';

const resolveDefaultRootTopic = (): string => {
  const translated = i18n.isInitialized ? i18n.t(DEFAULT_ROOT_TOPIC_KEY) : '';
  const localized = typeof translated === 'string' && translated !== DEFAULT_ROOT_TOPIC_KEY
    ? translated
    : '';
  return cleanMindMapTopic(localized, 'Central Topic');
};

const createDefaultData = (direction: MindElixirDirection = DEFAULT_DIRECTION): MindElixirData => ({
  nodeData: {
    id: 'root',
    topic: resolveDefaultRootTopic(),
    root: true,
    children: [],
  } as NodeObj & { root: true },
  direction,
});

export const loadMindElixirData = (ctx: PluginContext): MindElixirData => {
  try {
    const nodes = ctx.getNodes();
    const edges = ctx.getEdges();
    const storedDirection = localStorage.getItem('vizly_mindmap_dir');
    const persistedDirection = storedDirection
      ? coerceMindElixirDirection(directionStringToInt(storedDirection))
      : null;

    if (nodes.length === 0) {
      return createDefaultData(persistedDirection ?? DEFAULT_DIRECTION);
    }

    const canonicalMetaNode = nodes.find(node => (
      node.id === MINDMAP_META_NODE_ID
      && isMindMapV2(node.data?.mindmapV2)
    ));
    const compatibleMetaNode = canonicalMetaNode ?? nodes.find(node => (
      node.type === 'mindmap'
      && node.hidden === true
      && isMindMapV2(node.data?.mindmapV2)
    ));
    const embedded = compatibleMetaNode?.data?.mindmapV2;
    if (isMindMapV2(embedded)) {
      if (embedded.themeKey) persistMindMapThemeKey(embedded.themeKey);
      const cleaned = cleanMindMapData(embedded);
      return {
        nodeData: cleaned.nodeData,
        direction: persistedDirection ?? coerceMindElixirDirection(cleaned.direction),
        theme: embedded.theme ?? VIZLY_HYPER_THEME,
      };
    }

    const mindmapNodes = nodes.filter(node => node.type === 'mindmap');
    if (mindmapNodes.length === 0) {
      return createDefaultData(persistedDirection ?? DEFAULT_DIRECTION);
    }

    const childEdges = edges.filter(edge => edge.type !== 'relationshipEdge');
    const realNodes = mindmapNodes.filter(node => node.id !== '__mindmap_meta__');
    if (realNodes.length === 1 && childEdges.length === 0) {
      const rootLabel = cleanMindMapTopic(realNodes[0].data?.label, resolveDefaultRootTopic());
      return {
        ...createDefaultData(persistedDirection ?? DEFAULT_DIRECTION),
        nodeData: {
          id: 'root',
          topic: rootLabel,
          root: true,
          children: [],
        } as NodeObj & { root: true },
      };
    }

    const migrated = migrateV1ToV2({ nodes: mindmapNodes, edges });
    return {
      nodeData: migrated.nodeData,
      direction: persistedDirection ?? coerceMindElixirDirection(migrated.direction),
      theme: VIZLY_HYPER_THEME,
    };
  } catch {
    return createDefaultData();
  }
};

export const createMindElixirPersistenceNodes = (
  previous: Node[],
  data: MindElixirData,
): Node[] => {
  const payload = createSafeMindMapV2Payload(
    data,
    resolveMindMapThemeKey(),
    DEFAULT_DIRECTION,
  );
  return [
    ...previous.filter(node => (
      node.id !== MINDMAP_META_NODE_ID
      && !(
        node.type === 'mindmap'
        && node.hidden === true
        && isMindMapV2(node.data?.mindmapV2)
      )
    )),
    {
      id: MINDMAP_META_NODE_ID,
      type: 'mindmap',
      position: { x: -9999, y: -9999 },
      hidden: true,
      data: {
        mindmapV2: payload,
        depth: -1,
        label: '',
        pageCopyIdPolicy: PRESERVE_PAGE_COPY_NODE_ID,
        pageContentMetrics: createPageContentMetrics(countNodes(payload.nodeData), 0),
      },
    },
  ];
};

export const captureMindElixirPageState = (
  ctx: PluginContext,
  mind: MindElixirInstance | null,
): { nodes: Node[]; edges: Edge[] } => {
  const nodes = ctx.getNodes();
  const edges = ctx.getEdges();
  if (!mind) return { nodes, edges };

  try {
    return {
      nodes: createMindElixirPersistenceNodes(nodes, mind.getData()),
      edges,
    };
  } catch (error) {
    logMindmapWrapperSaveFailure(error);
    return { nodes, edges };
  }
};

export const saveMindElixirData = (ctx: PluginContext, mind: MindElixirInstance): void => {
  try {
    const data = mind.getData();
    ctx.setNodes(previous => createMindElixirPersistenceNodes(previous, data));
  } catch (error) {
    logMindmapWrapperSaveFailure(error);
  }
};
