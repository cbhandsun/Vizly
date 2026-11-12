import { describe, expect, it } from 'vitest';
import { addStartupResourceHints } from './startupResourceHints';

const guard = '<script src="/assets/startup-resource-guard.v1.js"></script>';
const entry = '<script type="module" crossorigin src="/assets/index-Abc12345.js"></script>';
const style = '<link rel="stylesheet" crossorigin href="/assets/index-Abc12345.css">';
const preload = '<link rel="modulepreload" crossorigin href="/assets/runtime-Abc12345.js">';
const policy = '<meta http-equiv="Content-Security-Policy" content="script-src \'self\';">';
const html = `<html><head>${policy}${guard}${entry}${preload}${style}</head><body></body></html>`;
const files = new Set(['assets/index-Abc12345.js', 'assets/runtime-Abc12345.js', 'assets/index-Abc12345.css']);

describe('startup resource hints', () => {
  it('downloads known entry dependencies before the guard without moving executable scripts or applying styles', () => {
    const out = addStartupResourceHints(html, files);
    expect(out.indexOf(policy)).toBeLessThan(out.indexOf('rel="modulepreload"'));
    expect(out.indexOf('rel="modulepreload"')).toBeLessThan(out.indexOf(guard));
    expect(out.indexOf(preload)).toBeLessThan(out.indexOf(guard));
    expect(out.indexOf('rel="preload" as="style"')).toBeLessThan(out.indexOf(guard));
    expect(out.indexOf(guard)).toBeLessThan(out.indexOf(entry));
    expect(out.indexOf(guard)).toBeLessThan(out.indexOf(style));
    expect(out.match(/<script\b[^>]*>/gu)).toEqual(html.match(/<script\b[^>]*>/gu));
    expect(out).toContain(policy);
    expect(out).not.toContain('unsafe-inline');
  });

  it('does not add duplicate download hints when transformed again', () => {
    const out = addStartupResourceHints(addStartupResourceHints(html, files), files);
    expect(out.match(/rel="modulepreload"/gu)).toHaveLength(2);
    expect(out.match(/rel="preload" as="style"/gu)).toHaveLength(1);
    expect(out.match(/rel="stylesheet"/gu)).toHaveLength(1);
  });

  it.each(['/assets/missing-Abc12345.js', 'https://other.invalid/entry.js', '/assets/../entry.js', '/assets/entry.js?secret=value'])('rejects missing, external or noncanonical entry references: %s', url => {
    expect(() => addStartupResourceHints(html.replace('/assets/index-Abc12345.js', url), files)).toThrow('emitted same-origin');
  });

  it('rejects ambiguous guard or entry order rather than bypassing recovery', () => {
    expect(() => addStartupResourceHints(html.replace(guard, ''), files)).toThrow('one independent');
    expect(() => addStartupResourceHints(html.replace(guard, guard + guard), files)).toThrow('one independent');
    expect(() => addStartupResourceHints(html.replace(guard, '').replace(entry, entry + guard), files)).toThrow('before entry');
    expect(() => addStartupResourceHints(html.replace(entry, entry + entry), files)).toThrow('one application');
  });
});
