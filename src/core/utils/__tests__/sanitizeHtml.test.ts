import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sanitizeInlineHtml,
  sanitizeMarkdownHtml,
  SANITIZE_HTML_MAX_CHARS,
  SAFE_EXTERNAL_URL_MAX_CHARS,
  SAFE_IMAGE_DATA_URL_MAX_CHARS,
  sanitizeSvgMarkup,
  toSafeExternalUrl,
  toSafeImageUrl,
} from '../sanitizeHtml';

describe('sanitizeHtml utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes script tags and event handlers from inline labels', () => {
    const result = sanitizeInlineHtml('<b onclick="alert(1)">Hi</b><script>alert(2)</script>');

    expect(result).toContain('<b>Hi</b>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert(2)');
  });

  it('keeps safe markdown links and removes javascript URLs', () => {
    const result = sanitizeMarkdownHtml(
      '<p><a href="https://example.com">safe</a><a href="javascript:alert(1)">bad</a></p>'
    );

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain('javascript:');
  });

  it('keeps safe markdown style, title, relative, hash, and mail links', () => {
    const result = sanitizeMarkdownHtml(
      '<p><a href="#section" title="jump">hash</a><a href="/docs">relative</a><a href="mailto:user@example.com">mail</a></p>' +
      '<span style="color: red; font-size: 120%; background-image: url(javascript:alert(1)); expression: bad">styled</span>' +
      '<font size="9">big</font><font size="3">ok</font>'
    );

    expect(result).toContain('href="#section"');
    expect(result).toContain('href="/docs"');
    expect(result).toContain('href="mailto:user@example.com"');
    expect(result).toContain('title="jump"');
    expect(result).toContain('style="color: red; font-size: 120%"');
    expect(result).toContain('<font>big</font>');
    expect(result).toContain('<font size="3">ok</font>');
    expect(result).not.toContain('background-image');
    expect(result).not.toContain('expression');
  });

  it('rejects protocol-relative markdown links while preserving site-relative links', () => {
    const result = sanitizeMarkdownHtml(
      '<a href="//evil.example/path">protocol relative</a><a href="/safe/path">site relative</a>'
    );

    expect(result).not.toContain('href="//evil.example/path"');
    expect(result).toContain('href="/safe/path"');
  });

  it('unwraps unknown inline tags and escapes input when document is unavailable', () => {
    expect(sanitizeInlineHtml('<custom><b>safe</b></custom>')).toBe('<b>safe</b>');
    expect(sanitizeMarkdownHtml('')).toBe('');

    vi.stubGlobal('document', undefined);

    expect(sanitizeInlineHtml('<b>"safe" & risky</b>')).toBe('&lt;b&gt;&quot;safe&quot; &amp; risky&lt;/b&gt;');
  });

  it('bounds sanitizer input before DOM parsing', () => {
    const result = sanitizeInlineHtml(`${'a'.repeat(SANITIZE_HTML_MAX_CHARS)}<script>alert(1)</script>tail`);

    expect(result.length).toBe(SANITIZE_HTML_MAX_CHARS);
    expect(result).not.toContain('script');
    expect(result).not.toContain('tail');
  });

  it('strips unsafe SVG attributes and URL payloads', () => {
    const result = sanitizeSvgMarkup('<svg onload="alert(1)"><path d="M0 0" fill="url(javascript:alert(1))" stroke="red"/></svg>');

    expect(result).toContain('<svg>');
    expect(result).toContain('d="M0 0"');
    expect(result).toContain('stroke="red"');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('fill=');
  });

  it('allows only http or https external URLs and upgrades host-only input', () => {
    expect(toSafeExternalUrl('example.com/path')).toBe('https://example.com/path');
    expect(toSafeExternalUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(toSafeExternalUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects unsafe external URL protocols and malformed protocol-relative input', () => {
    expect(toSafeExternalUrl(' data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(toSafeExternalUrl('  javascript:alert(1)')).toBeNull();
    expect(toSafeExternalUrl('//evil.example/path')).toBeNull();
    expect(toSafeExternalUrl('ftp://example.com/file')).toBeNull();
  });

  it('allows http images and raster data URLs while rejecting scriptable image payloads', () => {
    expect(toSafeImageUrl('images.example.com/photo.png')).toBe('https://images.example.com/photo.png');
    expect(toSafeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(toSafeImageUrl('data:image/avif;base64,AAAA')).toBe('data:image/avif;base64,AAAA');
    expect(toSafeImageUrl('   ')).toBeNull();
    expect(toSafeImageUrl('data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+')).toBeNull();
    expect(toSafeImageUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects empty and malformed external URLs', () => {
    expect(toSafeExternalUrl('   ')).toBeNull();
    expect(toSafeExternalUrl('http://[bad-host')).toBeNull();
  });

  it('rejects overlong external URLs before rendering them', () => {
    expect(toSafeExternalUrl(`https://example.com/${'x'.repeat(SAFE_EXTERNAL_URL_MAX_CHARS)}`)).toBeNull();
  });

  it('rejects malformed or overlong raster data image URLs', () => {
    expect(toSafeImageUrl('data:image/png;base64,not valid base64')).toBeNull();
    expect(toSafeImageUrl(`data:image/png;base64,${'A'.repeat(SAFE_IMAGE_DATA_URL_MAX_CHARS)}`)).toBeNull();
    expect(toSafeImageUrl('data:image/png;base64,QUJDRA==')).toBe('data:image/png;base64,QUJDRA==');
  });
});
