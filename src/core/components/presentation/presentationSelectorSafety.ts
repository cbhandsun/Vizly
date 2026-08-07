/**
 * Escapes an untrusted value for use inside a double-quoted CSS attribute selector.
 * Node IDs can originate from imported, shared, or restored diagrams, so they must
 * not be interpolated into presentation styles verbatim.
 */
export const escapePresentationSelectorValue = (value: string): string => {
  let escaped = '';

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint === 0) {
      escaped += '\\fffd ';
    } else if (
      codePoint <= 0x1f
      || codePoint === 0x7f
      || codePoint === 0x2028
      || codePoint === 0x2029
    ) {
      escaped += `\\${codePoint.toString(16)} `;
    } else if (character === '"' || character === '\\') {
      escaped += `\\${character}`;
    } else {
      escaped += character;
    }
  }

  return escaped;
};

export const buildPresentationNodeSelector = (nodeId: string): string =>
  `.react-flow__node[data-id="${escapePresentationSelectorValue(nodeId)}"]`;

export const buildPresentationEdgeSelector = (nodeId: string): string => {
  const safeNodeId = escapePresentationSelectorValue(nodeId);
  return `.react-flow__edge[data-source="${safeNodeId}"], .react-flow__edge[data-target="${safeNodeId}"]`;
};

export const buildPresentationEdgeIdSelector = (edgeId: string): string =>
  `.react-flow__edge[data-id="${escapePresentationSelectorValue(edgeId)}"]`;
