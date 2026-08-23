import { describe, expect, it } from 'vitest';

import { assertDisplayRoutingProductionPreview } from './display-routing-production-preview.mjs';

const response = ({ ok = true, status = 200, html = '' } = {}) => ({
  ok,
  status,
  text: async () => html,
});

describe('assertDisplayRoutingProductionPreview', () => {
  it('accepts a production Vite asset response', async () => {
    let request = null;
    await assertDisplayRoutingProductionPreview('http://127.0.0.1:4173', async (...args) => {
      request = args;
      return response({ html: '<script type="module" src="/assets/index-123.js"></script>' });
    });
    expect(request).toEqual([
      'http://127.0.0.1:4173/',
      { redirect: 'follow' },
    ]);
  });

  it('rejects missing, HTTP-failed, development, and malformed previews', async () => {
    await expect(assertDisplayRoutingProductionPreview('', async () => response()))
      .rejects.toThrow(/must point to a production/);
    await expect(assertDisplayRoutingProductionPreview('http://preview', async () => response({
      ok: false,
      status: 503,
    }))).rejects.toThrow(/HTTP 503/);
    await expect(assertDisplayRoutingProductionPreview('http://preview', async () => response({
      html: '<script type="module" src="/@vite/client"></script>',
    }))).rejects.toThrow(/not a production Vite preview/);
    await expect(assertDisplayRoutingProductionPreview('http://preview', async () => response({
      html: '<html>no production asset</html>',
    }))).rejects.toThrow(/not a production Vite preview/);
  });
});
