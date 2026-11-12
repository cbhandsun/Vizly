# @vizly/contracts

Portable Vizly document, command, event, and host-service contracts. This
package deliberately has no React, DOM, design-system, storage-provider, or
private engine dependency.

The package is licensed under MIT. Its source is staged in the clean-history
application repository; npm publication remains gated pending final Core terms.

`parseVizlyDocument` rejects missing parents (`missing-node-parent`), self-parent
links (`self-node-parent`) and ancestor cycles (`cyclic-node-parent`), with a
`$.nodes[index].parentId` error path. Parent order is unrestricted; validation is
iterative and linear within the 10,000-node document limit.

Historical malformed documents require an explicit call to
`importLegacyVizlyDocument(input, { hierarchy: 'detach-invalid-parents' })`.
The adapter returns `repairs` alongside an owned document; callers must present
the repair report instead of silently recovering on ordinary load. It detaches
missing/self parent links and one cycle-closing link per cycle, deterministically
in document order. Nodes, valid edges, and stored local positions remain intact;
absolute geometry cannot be reconstructed reliably for broken ancestry. Other
structural errors remain errors. Re-importing a repaired document is idempotent.

The Core UI and portable handle retain surviving children when deleting a
container. Children move to the nearest surviving ancestor (or canvas root),
with local coordinates adjusted to preserve their canvas position. Edges
incident to deleted nodes are removed; edges between surviving nodes remain.
Locked nodes that would be deleted or reparented, and locked incident edges,
block the operation. Existing mind-map edge-based subtree deletion is separate.

This stricter source contract is staged for T13. Browser undo/redo verification,
website recovery UX, package version alignment and installed-SDK regression must
be completed before promoting the updated SDK to the website.
