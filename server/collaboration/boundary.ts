import * as Y from 'yjs';
import { readCollaborationElement } from './documentModel.js';

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseConnection = (rawUrl: unknown, origin: unknown, origins: ReadonlySet<string>) => {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/vizly-room-') || rawUrl.length > 5000 || typeof origin !== 'string' || !origins.has(origin)) return null;
  try {
    const url = new URL(rawUrl, 'http://localhost');
    const room = url.pathname.slice(1);
    const diagramId = room.startsWith('vizly-room-') ? room.slice(11) : '';
    const token = url.searchParams.get('token');
    if (!uuid.test(diagramId) || !token || token.length > 4096 || /\s/.test(token)
      || [...token].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
      || url.searchParams.getAll('token').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'token')) return null;
    return { diagramId: diagramId.toLowerCase(), token };
  } catch { return null; }
};

const validJson = (value: unknown, budget: { bytes: number }, depth = 0): boolean => {
  if (depth > 8) return false;
  if (value === null || value === undefined || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    budget.bytes += Buffer.byteLength(value);
    return value.length <= 20_000 && budget.bytes <= MAX_DOCUMENT_BYTES;
  }
  if (!Array.isArray(value) && !isRecord(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  if (Array.isArray(value) && value.length > 2000) return false;
  const keys = Object.keys(value);
  if (keys.length > (Array.isArray(value) ? 2000 : 200)) return false;
  return keys.every(key => {
    budget.bytes += Buffer.byteLength(key) + 8;
    return !forbidden.has(key) && budget.bytes <= MAX_DOCUMENT_BYTES && validJson((value as Record<string, unknown>)[key], budget, depth + 1);
  });
};

/** Validate the complete candidate before it can replace the accepted room state. */
export const validateDocument = (doc: Y.Doc): boolean => {
  try {
    if ([...doc.share.keys()].some(key => !['flowchart-nodes', 'flowchart-edges'].includes(key))) return false;
    const nodes = doc.getMap<unknown>('flowchart-nodes');
    const edges = doc.getMap<unknown>('flowchart-edges');
    if (nodes.size > 1000 || edges.size > 2000 || (nodes.size === 0 && edges.size > 0)) return false;
    const budget = { bytes: 0 };
    const materializedNodes = new Map<string, NonNullable<ReturnType<typeof readCollaborationElement>>>();
    for (const [id, value] of nodes) {
      const node = readCollaborationElement(value);
      if (!idPattern.test(id) || !isRecord(node) || node.id !== id || !isRecord(node.position) || !isRecord(node.data)
        || typeof node.position.x !== 'number' || typeof node.position.y !== 'number'
        || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)
        || Math.abs(node.position.x) > 1_000_000 || Math.abs(node.position.y) > 1_000_000
        || (node.parentId !== undefined && (typeof node.parentId !== 'string' || !nodes.has(node.parentId) || node.parentId === id))
        || !validJson(node, budget)) return false;
      materializedNodes.set(id, node);
    }
    for (const [id, node] of materializedNodes) {
      const visited = new Set([id]);
      let parent: unknown = node.parentId;
      while (typeof parent === 'string') {
        if (visited.has(parent)) return false;
        visited.add(parent);
        const parentNode = materializedNodes.get(parent);
        parent = isRecord(parentNode) ? parentNode.parentId : undefined;
      }
    }
    for (const [id, value] of edges) {
      const edge = readCollaborationElement(value);
      if (!idPattern.test(id) || !isRecord(edge) || edge.id !== id || typeof edge.source !== 'string'
        || typeof edge.target !== 'string' || !nodes.has(edge.source) || !nodes.has(edge.target) || !validJson(edge, budget)) return false;
    }
    return Y.encodeStateAsUpdate(doc).byteLength <= MAX_DOCUMENT_BYTES;
  } catch { return false; }
};
