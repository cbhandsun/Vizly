import type { Plugin } from 'vite';

const guardTag = '<script src="/assets/startup-resource-guard.v1.js"></script>';
const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}=["']([^"']*)["']`, 'u').exec(tag)?.[1];

/** Download entry dependencies while the independent guard installs first. */
export const addStartupResourceHints = (html: string, emittedFiles: ReadonlySet<string>): string => {
  if (html.split(guardTag).length !== 2) throw new Error('Expected one independent startup guard');
  const moduleScripts = [...html.matchAll(/<script\b[^>]*>/gu)]
    .map(match => match[0]).filter(tag => attribute(tag, 'type') === 'module');
  if (moduleScripts.length !== 1) throw new Error('Expected one application module entry');
  const guardPosition = html.indexOf(guardTag);
  if (guardPosition > html.indexOf(moduleScripts[0])) throw new Error('Startup guard must execute before entry');

  const checked = (url: string | undefined, extension: 'js' | 'css'): string => {
    if (!url || !new RegExp(`^/assets/[A-Za-z0-9_.-]+\\.${extension}$`, 'u').test(url)
      || !emittedFiles.has(url.slice(1))) throw new Error('Startup hint is not an emitted same-origin asset');
    return url;
  };
  const entry = checked(attribute(moduleScripts[0], 'src'), 'js');
  const links = [...html.matchAll(/<link\b[^>]*>/gu)].map(match => match[0]);
  const modulePreloads = links.filter(tag => attribute(tag, 'rel') === 'modulepreload');
  const stylesheets = links.filter(tag => attribute(tag, 'rel') === 'stylesheet');
  if (modulePreloads.length + stylesheets.length > 32) throw new Error('Too many startup resource hints');
  const modules = new Set([entry, ...modulePreloads.map(tag => checked(attribute(tag, 'href'), 'js'))]);
  const hints = [...modules].map(url => `<link rel="modulepreload" crossorigin href="${url}">`);
  for (const tag of stylesheets) {
    const url = checked(attribute(tag, 'href'), 'css');
    const existing = links.some(link => attribute(link, 'rel') === 'preload'
      && attribute(link, 'as') === 'style' && attribute(link, 'href') === url);
    if (!existing) {
      const cors = /\scrossorigin(?:\s|=|>)/u.test(tag);
      if (attribute(tag, 'crossorigin') === 'use-credentials') throw new Error('Unsupported credentialed startup style');
      hints.push(`<link rel="preload" as="style"${cors ? ' crossorigin' : ''} href="${url}">`);
    }
  }
  // A stylesheet before the classic guard would delay its execution. Preload
  // only; keep the applying stylesheet and module script in their original order.
  let result = html;
  for (const tag of modulePreloads) result = result.replace(tag, '');
  return result.replace(guardTag, hints.join('\n    ') + '\n    ' + guardTag);
};

export const startupResourceHints = (): Plugin => ({
  name: 'vizly-startup-resource-hints',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html, context) => context.bundle
      ? addStartupResourceHints(html, new Set(Object.keys(context.bundle)))
      : html,
  },
});
