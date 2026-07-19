// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { coerceRemoteTemplateMetadata } from '../remoteTemplateMetadata';

describe('remoteTemplateMetadata', () => {
  it('keeps safe template thumbnail URLs', () => {
    expect(coerceRemoteTemplateMetadata({
      id: 'template-1',
      title: 'Template',
      category: 'general',
      tags: ['demo'],
      thumbnail_url: 'https://cdn.example.test/templates/one.png',
    })).toEqual({
      id: 'template-1',
      title: 'Template',
      category: 'general',
      tags: ['demo'],
      thumbnail_url: 'https://cdn.example.test/templates/one.png',
    });

    expect(coerceRemoteTemplateMetadata({
      thumbnail_url: 'images.example.test/templates/one.webp',
    }).thumbnail_url).toBe('https://images.example.test/templates/one.webp');
  });

  it('drops unsafe or malformed template thumbnails', () => {
    expect(coerceRemoteTemplateMetadata({ thumbnail_url: 'javascript:alert(1)' }).thumbnail_url).toBeNull();
    expect(coerceRemoteTemplateMetadata({ thumbnail_url: 'data:image/svg+xml;base64,PHN2Zy8+' }).thumbnail_url).toBeNull();
    expect(coerceRemoteTemplateMetadata({ thumbnail_url: 'file:///C:/Users/example/secret.png' }).thumbnail_url).toBeNull();
    expect(coerceRemoteTemplateMetadata({ thumbnail_url: '//tracker.example.test/pixel.png' }).thumbnail_url).toBeNull();
    expect(coerceRemoteTemplateMetadata({ thumbnail_url: 'https://example.test/' + 'x'.repeat(2048) }).thumbnail_url).toBeNull();
    expect(coerceRemoteTemplateMetadata({ thumbnail_url: 42 }).thumbnail_url).toBeNull();
  });
});
