// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  EXPORT_TEXT_MAX_CELL_CHARS,
  EXPORT_TEXT_MAX_MARKDOWN_INLINE_CHARS,
  EXPORT_TEXT_MAX_MERMAID_ID_CHARS,
  EXPORT_TEXT_MAX_MERMAID_LABEL_CHARS,
  escapeMarkdownInlineText,
  escapeMarkdownTableCell,
  escapeMermaidLabel,
  toMermaidNodeId,
  toSafeMermaidColor,
} from '../exportTextSecurity';

describe('exportTextSecurity', () => {
  it('escapes markdown table structure characters', () => {
    expect(escapeMarkdownTableCell('a|b\nc')).toBe('a\\|b c');
    expect(escapeMarkdownTableCell('```mermaid')).toBe('\\`\\`\\`mermaid');
    expect(escapeMarkdownTableCell('x'.repeat(EXPORT_TEXT_MAX_CELL_CHARS + 1))).toHaveLength(EXPORT_TEXT_MAX_CELL_CHARS);
  });

  it('escapes markdown inline text and bounds length', () => {
    expect(escapeMarkdownInlineText('title\n```')).toBe('title \\`\\`\\`');
    expect(escapeMarkdownInlineText('x'.repeat(EXPORT_TEXT_MAX_MARKDOWN_INLINE_CHARS + 1))).toHaveLength(EXPORT_TEXT_MAX_MARKDOWN_INLINE_CHARS);
  });

  it('creates safe Mermaid node ids', () => {
    expect(toMermaidNodeId('node-1/../../x')).toBe('node_1_x');
    expect(toMermaidNodeId('123')).toBe('node_123');
    expect(toMermaidNodeId('***')).toBe('node');
    expect(toMermaidNodeId(`${'a'.repeat(EXPORT_TEXT_MAX_MERMAID_ID_CHARS)}__tail`)).toHaveLength(EXPORT_TEXT_MAX_MERMAID_ID_CHARS);
  });

  it('escapes Mermaid labels that can break quoted labels or code fences', () => {
    expect(escapeMermaidLabel('say "hi"\n```mermaid')).toBe('say \\"hi\\" \\`\\`\\`mermaid');
    expect(escapeMermaidLabel('a\\b')).toBe('a\\\\b');
    expect(escapeMermaidLabel('x'.repeat(EXPORT_TEXT_MAX_MERMAID_LABEL_CHARS + 1))).toHaveLength(EXPORT_TEXT_MAX_MERMAID_LABEL_CHARS);
  });

  it('allows only safe Mermaid hex colors', () => {
    expect(toSafeMermaidColor('#fff')).toBe('#fff');
    expect(toSafeMermaidColor('#112233aa')).toBe('#112233aa');
    expect(toSafeMermaidColor('#fff\nA-->B')).toBeNull();
    expect(toSafeMermaidColor('red')).toBeNull();
  });
});
