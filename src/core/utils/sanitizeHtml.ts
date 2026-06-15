const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'span', 'font', 'code', 'sub', 'sup']);
const MARKDOWN_TAGS = new Set([
  ...INLINE_TAGS,
  'p', 'div', 'blockquote', 'pre',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'hr'
]);
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'title'
]);

const SVG_ATTRS = new Set([
  'class', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-rule', 'fill-opacity',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'opacity', 'transform', 'gradientunits', 'offset', 'stop-color', 'stop-opacity',
  'xmlns', 'role', 'aria-hidden', 'focusable'
]);

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const STYLE_PROPS = new Set(['color', 'font-weight', 'font-style', 'text-decoration', 'font-size']);
const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta']);
export const SAFE_EXTERNAL_URL_MAX_CHARS = 2048;
export const SAFE_IMAGE_DATA_URL_MAX_CHARS = 4 * 1024 * 1024;
export const SANITIZE_HTML_MAX_CHARS = 1 * 1024 * 1024;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch] as string));

const isSafeUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

const sanitizeStyle = (value: string): string => {
  return value
    .split(';')
    .map(part => {
      const [rawProp, ...rawValueParts] = part.split(':');
      const prop = rawProp?.trim().toLowerCase();
      const rawValue = rawValueParts.join(':').trim();
      if (!prop || !rawValue || !STYLE_PROPS.has(prop)) return '';
      if (/url\s*\(|expression\s*\(|javascript:/i.test(rawValue)) return '';
      if (prop === 'font-size' && !/^(\d{1,2}px|\d{1,3}%|small|medium|large|x-large)$/i.test(rawValue)) return '';
      return `${prop}: ${rawValue}`;
    })
    .filter(Boolean)
    .join('; ');
};

const unwrapElement = (element: Element) => {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
};

const cleanElement = (element: Element, allowedTags: Set<string>, mode: 'inline' | 'markdown' | 'svg') => {
  const tagName = element.tagName.toLowerCase();
  if (!allowedTags.has(tagName)) {
    if (DROP_CONTENT_TAGS.has(tagName)) {
      element.remove();
      return;
    }
    unwrapElement(element);
    return;
  }

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    const isEvent = name.startsWith('on');

    if (isEvent) {
      element.removeAttribute(attr.name);
      continue;
    }

    if (mode === 'svg') {
      if (!SVG_ATTRS.has(name) || /url\s*\(|javascript:/i.test(value)) {
        element.removeAttribute(attr.name);
      }
      continue;
    }

    if (tagName === 'a') {
      if (name === 'href') {
        if (!isSafeUrl(value)) element.removeAttribute(attr.name);
      } else if (name === 'title') {
        continue;
      } else {
        element.removeAttribute(attr.name);
      }
      continue;
    }

    if (name === 'style') {
      const safeStyle = sanitizeStyle(value);
      if (safeStyle) element.setAttribute('style', safeStyle);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (tagName === 'font' && name === 'size') {
      if (!/^[1-7]$/.test(value)) element.removeAttribute(attr.name);
      continue;
    }

    element.removeAttribute(attr.name);
  }

  if (tagName === 'a') {
    element.setAttribute('rel', 'noopener noreferrer');
    element.setAttribute('target', '_blank');
  }
};

const sanitizeMarkup = (html: string, allowedTags: Set<string>, mode: 'inline' | 'markdown' | 'svg'): string => {
  if (!html) return '';
  const boundedHtml = html.length > SANITIZE_HTML_MAX_CHARS
    ? html.slice(0, SANITIZE_HTML_MAX_CHARS)
    : html;
  if (typeof document === 'undefined') return escapeHtml(boundedHtml);

  const template = document.createElement('template');
  template.innerHTML = boundedHtml;

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    cleanElement(element, allowedTags, mode);
  }

  return template.innerHTML;
};

export const sanitizeInlineHtml = (html: string): string => sanitizeMarkup(html, INLINE_TAGS, 'inline');

export const sanitizeMarkdownHtml = (html: string): string => sanitizeMarkup(html, MARKDOWN_TAGS, 'markdown');

export const sanitizeSvgMarkup = (html: string): string => sanitizeMarkup(html, SVG_TAGS, 'svg');

export const toSafeExternalUrl = (rawUrl: string): string | null => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.length > SAFE_EXTERNAL_URL_MAX_CHARS) return null;
  if (trimmed.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const toSafeImageUrl = (rawUrl: string): string | null => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const dataMatch = /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.exec(trimmed);
  if (dataMatch) {
    if (trimmed.length > SAFE_IMAGE_DATA_URL_MAX_CHARS) return null;
    const payload = trimmed.slice(dataMatch[0].length);
    if (!payload || payload.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(payload)) return null;
    return trimmed;
  }
  if (/^data:/i.test(trimmed)) return null;

  return toSafeExternalUrl(trimmed);
};
