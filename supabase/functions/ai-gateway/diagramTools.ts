import { tool } from 'ai';
import { z } from 'zod';

const safeToken = /^[A-Za-z0-9_.:-]+$/;
const id = z.string().min(1).max(120).regex(safeToken);
const label = z.string().trim().min(1).max(200);
const optionalToken = z.string().min(1).max(80).regex(safeToken).optional();
const ids = z.array(id).min(1).max(50);

const styleSchema = z.record(
  z.string().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/),
  z.string().max(200),
).refine(value => Object.keys(value).length <= 40, 'Too many style properties');

export const diagramTools = {
  addNode: tool({
    description: 'Add one node to the current diagram.',
    inputSchema: z.object({ label, shape: optionalToken, type: optionalToken }).strict(),
  }),
  addChild: tool({
    description: 'Add a child node under an existing parent node.',
    inputSchema: z.object({
      parentId: id,
      label: label.optional(),
      shape: optionalToken,
      type: optionalToken,
      side: z.string().min(1).max(16).regex(safeToken).optional(),
    }).strict(),
  }),
  connectNodes: tool({
    description: 'Connect two existing diagram nodes.',
    inputSchema: z.object({ source: id, target: id, label: label.optional() }).strict(),
  }),
  layout: tool({
    description: 'Apply an automatic layout to the current diagram.',
    inputSchema: z.object({ strategy: optionalToken }).strict(),
  }),
  groupNodes: tool({
    description: 'Group existing nodes under a bounded group name.',
    inputSchema: z.object({ ids, name: label.optional(), label: label.optional() }).strict(),
  }),
  updateTheme: tool({
    description: 'Update safe theme variables for the current diagram.',
    inputSchema: z.object({ style: styleSchema }).strict(),
  }),
  presentation: tool({
    description: 'Enable or disable presentation mode.',
    inputSchema: z.object({ active: z.boolean().optional() }).strict(),
  }),
  animatePath: tool({
    description: 'Animate existing edge identifiers on the diagram.',
    inputSchema: z.object({
      ids,
      duration: z.number().finite().positive().max(60_000).optional(),
      loop: z.boolean().optional(),
    }).strict(),
  }),
  collapse: tool({
    description: 'Collapse or expand one supported diagram node.',
    inputSchema: z.object({ id, collapsed: z.boolean().optional() }).strict(),
  }),
};
