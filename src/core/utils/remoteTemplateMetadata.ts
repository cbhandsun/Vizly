import { toSafeImageUrl } from './sanitizeHtml';

export interface RemoteTemplateMetadataInput {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  tags?: unknown;
  thumbnail_url?: unknown;
}

export interface RemoteTemplateMetadata {
  id: unknown;
  title: unknown;
  category: unknown;
  tags: unknown;
  thumbnail_url: string | null;
}

export const coerceRemoteTemplateMetadata = (input: RemoteTemplateMetadataInput): RemoteTemplateMetadata => {
  const thumbnailUrl = typeof input.thumbnail_url === 'string'
    ? toSafeImageUrl(input.thumbnail_url)
    : null;

  return {
    id: input.id,
    title: input.title,
    category: input.category,
    tags: input.tags,
    thumbnail_url: thumbnailUrl,
  };
};
