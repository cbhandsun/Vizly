import type { Edge, Node } from '@xyflow/react';
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Remote content never replaces this editor's local selection or text-edit session. */
export const preserveLocalCollaborationInteraction = (snapshot: { nodes: Node[]; edges: Edge[] }, localInput: unknown) => {
  if (!record(localInput) || !Array.isArray(localInput.nodes)) return snapshot;
  const localNodes = new Map<string, Record<string, unknown>>();
  for (const input of localInput.nodes) if (record(input) && typeof input.id === 'string') localNodes.set(input.id, input);
  return { ...snapshot, nodes: snapshot.nodes.map(node => {
    const local = localNodes.get(node.id);
    if (!local) return node;
    const editing = record(local.data) && typeof local.data.isEditing === 'boolean' ? local.data.isEditing : undefined;
    return { ...node, ...(typeof local.selected === 'boolean' ? { selected: local.selected } : {}),
      ...(editing === undefined ? {} : { data: { ...node.data, isEditing: editing } }) };
  }) };
};
