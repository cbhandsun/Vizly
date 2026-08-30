const ASSET_REFERENCE_PATTERN = /(?:src|href)=["']([^"']*\/assets\/[^"'?#]+)["']/gi;
const MAX_INDEX_HTML_LENGTH = 1_000_000;

export const readProductionViteAssetNames = rawHtml => {
  if (typeof rawHtml !== 'string' || rawHtml.length === 0 || rawHtml.length > MAX_INDEX_HTML_LENGTH) {
    throw new Error('Production preview index HTML is invalid');
  }
  const names = [];
  for (const match of rawHtml.matchAll(ASSET_REFERENCE_PATTERN)) {
    const value = match[1];
    const name = typeof value === 'string' ? value.split('/').at(-1) : '';
    if (name && /^[A-Za-z0-9._-]{1,200}$/.test(name)) names.push(name);
  }
  return [...new Set(names)].sort();
};

export const assertProductionPreviewMatchesLocalBuild = (remoteHtml, localHtml) => {
  const remoteAssets = readProductionViteAssetNames(remoteHtml);
  const localAssets = readProductionViteAssetNames(localHtml);
  if (remoteAssets.length === 0 || localAssets.length === 0) {
    throw new Error('Production preview is missing hashed Vite entry assets');
  }
  if (
    remoteAssets.length !== localAssets.length
    || remoteAssets.some((name, index) => name !== localAssets[index])
  ) {
    throw new Error('Production preview assets do not match the current local build');
  }
  return Object.freeze({ assetNames: Object.freeze([...remoteAssets]) });
};
