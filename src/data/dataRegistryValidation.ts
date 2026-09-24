export interface DiagramCollectionIssues {
  missingNodes: boolean;
  missingEdges: boolean;
}

export const getDiagramCollectionIssues = (
  value: unknown,
): DiagramCollectionIssues => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { missingNodes: true, missingEdges: true };
  }
  const candidate = value as Record<string, unknown>;
  return {
    missingNodes: !Array.isArray(candidate.nodes),
    missingEdges: !Array.isArray(candidate.edges),
  };
};
