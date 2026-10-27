import { expect, type Locator, type Page } from '@playwright/test';

export const createCollaborationAuxiliaryNodes = () => ([
  // StickyNoteNode.css renders a 200px-wide note with a 200px minimum height.
  // Keep the next row below its painted box, not the old 120px fixture height.
  ['sticky-test', 'sticky-note', 100, 100, 200, 200],
  ['mind-test', 'mindmap', 350, 100, 240, 120],
  ['title-test', 'titleGroup', 100, 380, 240, 120],
  ['sub-test', 'subGroup', 460, 380, 240, 120],
] as const).map(([id, type, x, y, width, height]) => ({
  id, type, position: { x, y }, width, height,
  data: { label: id, description: id, domain: 'wms', depth: 1, isEditing: false },
}));

export const expectAuxiliaryFixtureTitleClearance = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => {
    const sticky = document.querySelector('.react-flow__node[data-id="sticky-test"] .sticky-note-node');
    const title = document.querySelector('.react-flow__node[data-id="title-test"] .title-group-bar');
    if (!sticky || !title) return 0;
    return title.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom;
  }), { message: 'The painted sticky note must leave the title header unobstructed' }).toBeGreaterThan(0);
};

export const doubleClickAuxiliaryTitle = async (
  title: Locator,
  position?: { x: number; y: number },
) => {
  await expect.poll(() => title.evaluate((element, offset) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + (offset?.x ?? bounds.width / 2),
      bounds.top + (offset?.y ?? bounds.height / 2),
    );
    return Boolean(hit && element.contains(hit));
  }, position), { message: 'The title editing point must hit its actual visible element' }).toBe(true);
  await title.dblclick(position ? { position } : {});
};
