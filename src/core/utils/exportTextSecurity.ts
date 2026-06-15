export const EXPORT_TEXT_MAX_CELL_CHARS = 1_000;
export const EXPORT_TEXT_MAX_MERMAID_ID_CHARS = 128;
export const EXPORT_TEXT_MAX_MERMAID_LABEL_CHARS = 1_000;
export const EXPORT_TEXT_MAX_MARKDOWN_INLINE_CHARS = 500;

const truncate = (value: string, maxChars: number): string => value.slice(0, maxChars);

export const escapeMarkdownTableCell = (value: unknown): string => (
  truncate(String(value ?? ''), EXPORT_TEXT_MAX_CELL_CHARS)
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/```/g, '\\`\\`\\`')
    .trim()
);

export const escapeMarkdownInlineText = (value: unknown): string => (
  truncate(String(value ?? ''), EXPORT_TEXT_MAX_MARKDOWN_INLINE_CHARS)
    .replace(/\r?\n/g, ' ')
    .replace(/```/g, '\\`\\`\\`')
    .trim()
);

export const toMermaidNodeId = (value: unknown): string => {
  const cleaned = truncate(String(value ?? 'node'), EXPORT_TEXT_MAX_MERMAID_ID_CHARS)
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return 'node';
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `node_${cleaned}`;
};

export const escapeMermaidLabel = (value: unknown): string => (
  truncate(String(value ?? ''), EXPORT_TEXT_MAX_MERMAID_LABEL_CHARS)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .replace(/```/g, '\\`\\`\\`')
    .trim()
);

export const toSafeMermaidColor = (value: unknown): string | null => {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(color) ? color : null;
};
