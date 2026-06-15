import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { exportXmind, nodeToXmindTopic } from '../exportXmind';
import {
  MINDMAP_MAX_CHILDREN_PER_NODE,
  MINDMAP_MAX_NOTE_LENGTH,
  MINDMAP_MAX_TAGS,
  MINDMAP_MAX_TOPIC_LENGTH,
} from '../mindmapTreeSanitizer';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nodeToXmindTopic', () => {
  it('exports only safe hyperlinks', () => {
    expect(nodeToXmindTopic({ id: 'safe', topic: 'Safe', hyperLink: 'example.com/doc' } as NodeObj, 1).href)
      .toBe('https://example.com/doc');
    expect(nodeToXmindTopic({ id: 'https', topic: 'HTTPS', hyperLink: 'https://example.com/doc' } as NodeObj, 1).href)
      .toBe('https://example.com/doc');
    expect(nodeToXmindTopic({ id: 'bad', topic: 'Bad', hyperLink: 'javascript:alert(1)' } as NodeObj, 1).href)
      .toBeUndefined();
    expect(nodeToXmindTopic({ id: 'protocol-relative', topic: 'Bad', hyperLink: '//evil.example/doc' } as NodeObj, 1).href)
      .toBeUndefined();
  });

  it('exports only safe image sources', () => {
    expect(nodeToXmindTopic({
      id: 'safe-image',
      topic: 'Safe',
      image: { url: 'images.example.com/photo.png', width: 160, height: 100 },
    } as NodeObj, 1).image?.src).toBe('https://images.example.com/photo.png');

    expect(nodeToXmindTopic({
      id: 'bad-image',
      topic: 'Bad',
      image: { url: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+', width: 160, height: 100 },
    } as NodeObj, 1).image).toBeUndefined();
  });

  it('bounds exported text, labels, image dimensions, and child fan-out', () => {
    const topic = nodeToXmindTopic({
      id: 'root',
      topic: 't'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 20),
      note: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 20),
      tags: Array.from({ length: MINDMAP_MAX_TAGS + 5 }, (_, index) => `tag-${index}`),
      image: { url: 'images.example.com/photo.png', width: 99999, height: -5 },
      children: Array.from({ length: MINDMAP_MAX_CHILDREN_PER_NODE + 5 }, (_, index) => ({
        id: `child-${index}`,
        topic: `child-${index}`,
        children: [],
      })),
    } as NodeObj, 0);

    expect(topic.title).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
    expect(topic.notes?.plain.content).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    expect(topic.labels).toHaveLength(MINDMAP_MAX_TAGS);
    expect(topic.image).toMatchObject({ width: 2048, height: 1 });
    expect(topic.children?.attached).toHaveLength(MINDMAP_MAX_CHILDREN_PER_NODE);
  });
});

describe('exportXmind', () => {
  it('sanitizes user-derived download filenames while preserving the xmind extension', async () => {
    let downloadedName = '';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xmind-export');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    await exportXmind({ id: 'root', topic: 'Plan', children: [] } as NodeObj, '../AUX:<plan>');

    expect(downloadedName).toBe('_AUX_plan_.xmind');
    expect(revokeSpy).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(revokeSpy).toHaveBeenCalledWith('blob:xmind-export');
  });
});
