export const assertDisplayRoutingProductionPreview = async (
  baseUrl,
  fetchImpl = fetch,
) => {
  if (!baseUrl) {
    throw new Error(
      'PRECOMPILED_ROUTE_BASE_URL must point to a production `vite preview` server',
    );
  }
  const response = await fetchImpl(`${baseUrl}/`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Production preview returned HTTP ${response.status}`);
  const html = await response.text();
  if (
    html.includes('/@vite/client')
    || !/<script[^>]+src=["'][^"']*\/assets\/[^"']+\.js["']/i.test(html)
  ) {
    throw new Error('PRECOMPILED_ROUTE_BASE_URL is not a production Vite preview');
  }
};
