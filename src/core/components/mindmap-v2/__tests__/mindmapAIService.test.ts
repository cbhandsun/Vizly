import { describe, expect, it } from 'vitest';
import {
  cleanAndValidateTree,
  cleanMindMapIcons,
  cleanMindMapNote,
  cleanMindMapTags,
  cleanMindMapTopic,
  cleanMindMapData,
  MINDMAP_MAX_CHILDREN_PER_NODE,
  MINDMAP_MAX_DEPTH,
  MINDMAP_MAX_NODES,
  MINDMAP_MAX_NOTE_LENGTH,
  MINDMAP_MAX_TOPIC_LENGTH,
} from '../mindmapTreeSanitizer';
import { sanitizeAICustomActionResult } from '../mindmapAIService';

describe('cleanAndValidateTree', () => {
  it('keeps only safe AI-generated hyperlinks', () => {
    const cleaned = cleanAndValidateTree({
      topic: 'Root',
      hyperLink: 'javascript:alert(1)',
      children: [
        { topic: 'Safe', hyperLink: 'example.com/doc', children: [] },
        { topic: 'Bad', hyperLink: '//evil.example/doc', children: [] },
      ],
    }, true);

    expect(cleaned.hyperLink).toBeUndefined();
    expect(cleaned.children?.[0]?.hyperLink).toBe('https://example.com/doc');
    expect(cleaned.children?.[1]?.hyperLink).toBeUndefined();
  });

  it('bounds text, tags, icons and child fan-out', () => {
    const cleaned = cleanAndValidateTree({
      topic: 'x'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 20),
      note: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 20),
      tags: Array.from({ length: 50 }, (_, index) => `tag-${index}`),
      icons: Array.from({ length: 50 }, (_, index) => `icon-${index}`),
      children: Array.from({ length: MINDMAP_MAX_CHILDREN_PER_NODE + 20 }, (_, index) => ({
        topic: `child-${index}`,
      })),
    }, true);

    expect(cleaned.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
    expect(cleaned.note).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    expect(cleaned.tags).toHaveLength(20);
    expect(cleaned.icons).toHaveLength(20);
    expect(cleaned.children).toHaveLength(MINDMAP_MAX_CHILDREN_PER_NODE);
  });

  it('rejects overly deep and overly large trees', () => {
    let deep: any = { topic: 'leaf' };
    for (let i = 0; i < MINDMAP_MAX_DEPTH + 2; i += 1) {
      deep = { topic: `node-${i}`, children: [deep] };
    }
    expect(() => cleanAndValidateTree(deep, true)).toThrow('too deep');

    const makeTree = (count: number): any => ({
      topic: 'root',
      children: Array.from({ length: count }, (_, index) => ({ topic: `child-${index}` })),
    });
    expect(() => cleanAndValidateTree(makeTree(MINDMAP_MAX_NODES + 20), true)).not.toThrow();

    const root = { topic: 'root', children: [] as any[] };
    let cursor = root;
    for (let i = 0; i < MINDMAP_MAX_NODES; i += 1) {
      const child = { topic: `n-${i}`, children: [] as any[] };
      cursor.children = [child];
      cursor = child;
      if (i > MINDMAP_MAX_DEPTH) break;
    }
    expect(() => cleanAndValidateTree({
      topic: 'root',
      children: Array.from({ length: 80 }, (_, branch) => ({
        topic: `branch-${branch}`,
        children: Array.from({ length: 7 }, (_, leaf) => ({ topic: `leaf-${branch}-${leaf}` })),
      })),
    }, true)).toThrow('too many nodes');
  });

  it('normalizes full mind map payloads and strips unsafe fields', () => {
    const cleaned = cleanMindMapData({
      direction: 99,
      nodeData: {
        id: '__proto__',
        topic: 'Root',
        constructor: { polluted: true },
        branchColor: 'rgb(1,2,3)',
        shapeClass: 'script',
        style: { color: '#123456', background: 'url(javascript:alert(1))', fontSize: '999px' },
        image: { url: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+', width: 99999, height: -10 },
        boundary: { color: 'expression(alert(1))', title: 'g'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 5) },
        children: [{
          id: 'safe-1',
          topic: 'Child',
          branchColor: '#abcdef',
          shapeClass: 'diamond',
          branchWidth: 999,
          image: { url: 'images.example.com/photo.png', width: 99999, height: -10, fit: 'cover' },
        }],
      },
    });

    expect(cleaned.direction).toBe(3);
    expect(cleaned.nodeData.id).toBe('root');
    expect(cleaned.nodeData.branchColor).toBeUndefined();
    expect(cleaned.nodeData.shapeClass).toBeUndefined();
    expect(cleaned.nodeData.style).toEqual({ color: '#123456', fontSize: '48px' });
    expect(cleaned.nodeData.image).toBeUndefined();
    expect(cleaned.nodeData.boundary).toEqual({
      color: '#818cf8',
      title: 'g'.repeat(MINDMAP_MAX_TOPIC_LENGTH),
    });
    expect(cleaned.nodeData.children?.[0]?.id).toBe('safe-1');
    expect(cleaned.nodeData.children?.[0]?.branchColor).toBe('#abcdef');
    expect(cleaned.nodeData.children?.[0]?.shapeClass).toBe('diamond');
    expect(cleaned.nodeData.children?.[0]?.branchWidth).toBe(12);
    expect(cleaned.nodeData.children?.[0]?.image).toEqual({
      url: 'https://images.example.com/photo.png',
      width: 2048,
      height: 1,
      fit: 'cover',
    });
    expect(Object.hasOwn(cleaned.nodeData, 'constructor')).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('exposes bounded text/list helpers for AI panel patch operations', () => {
    expect(cleanMindMapTopic('x'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10))).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
    expect(cleanMindMapNote('n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 10))).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    expect(cleanMindMapTags(Array.from({ length: 30 }, (_, index) => `tag-${index}`))).toHaveLength(20);
    expect(cleanMindMapIcons(Array.from({ length: 30 }, (_, index) => `icon-${index}`))).toHaveLength(20);
  });

  it('sanitizes AI custom action patches before the panel applies them', () => {
    const result = sanitizeAICustomActionResult({
      topic: 't'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10),
      note: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 10),
      tags: Array.from({ length: 30 }, (_, index) => `tag-${index}`),
      icons: Array.from({ length: 30 }, (_, index) => `icon-${index}`),
      newChildren: [{
        topic: 'Child',
        hyperLink: 'javascript:alert(1)',
        constructor: { polluted: true },
        children: [{ topic: 'should-drop' }],
      }],
      unexpected: 'drop',
    });

    expect(result.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
    expect(result.note).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    expect(result.tags).toHaveLength(20);
    expect(result.icons).toHaveLength(20);
    expect(result.newChildren?.[0]?.hyperLink).toBeUndefined();
    expect(result.newChildren?.[0]?.children).toEqual([]);
    expect(Object.hasOwn(result.newChildren?.[0] || {}, 'constructor')).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});
