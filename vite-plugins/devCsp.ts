import type { Plugin } from 'vite';

const SCRIPT_SRC_SELF = "script-src 'self';";
const SCRIPT_SRC_DEV = "script-src 'self' 'unsafe-inline';";

export const enableViteDevInlineScripts = (html: string): string => {
  if (html.includes(SCRIPT_SRC_DEV)) return html;
  return html.replace(SCRIPT_SRC_SELF, SCRIPT_SRC_DEV);
};

export const devCspPlugin = (): Plugin => ({
  name: 'vizly-dev-csp',
  apply: 'serve',
  enforce: 'pre',
  transformIndexHtml: enableViteDevInlineScripts,
});
