import type { TemplateKey } from './diagramManagementPage.helpers';

const MAX_DIAGRAM_TITLE_LENGTH = 240;
const MAX_EXISTING_TITLES = 10_000;

type WorkspaceNameTranslator = (key: string) => string;

const DEFAULT_NAME_KEYS: Readonly<Record<TemplateKey, string>> = {
  blank: 'workspace.untitledFlowchart',
  flowchart: 'workspace.untitledFlowchart',
  architecture: 'workspace.newArchitectureDiagram',
  mindmap: 'workspace.newMindMap',
  timeline: 'workspace.newTimeline',
};

const normalizeTitle = (value: unknown, fallback: string): string => {
  const normalizedFallback = fallback.replace(/\s+/g, ' ').trim().slice(0, MAX_DIAGRAM_TITLE_LENGTH)
    || 'Untitled diagram';
  if (typeof value !== 'string') return normalizedFallback;
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_DIAGRAM_TITLE_LENGTH)
    || normalizedFallback;
};

const titleKey = (value: string): string => value.normalize('NFKC').toLocaleLowerCase('en-US');

export const createUniqueWorkspaceDiagramTitle = ({
  templateKey,
  translate,
  existingTitles,
}: {
  templateKey: TemplateKey;
  translate: WorkspaceNameTranslator;
  existingTitles: readonly unknown[];
}): string => {
  const baseTitle = normalizeTitle(translate(DEFAULT_NAME_KEYS[templateKey]), 'Untitled diagram');
  const occupied = new Set(
    existingTitles
      .slice(0, MAX_EXISTING_TITLES)
      .filter((value): value is string => typeof value === 'string')
      .map(value => titleKey(normalizeTitle(value, 'Untitled diagram'))),
  );
  if (!occupied.has(titleKey(baseTitle))) return baseTitle;

  for (let index = 2; index <= MAX_EXISTING_TITLES + 1; index += 1) {
    const suffix = ` ${index}`;
    const candidate = `${baseTitle.slice(0, MAX_DIAGRAM_TITLE_LENGTH - suffix.length).trimEnd()}${suffix}`;
    if (!occupied.has(titleKey(candidate))) return candidate;
  }

  return `${baseTitle.slice(0, MAX_DIAGRAM_TITLE_LENGTH - 6).trimEnd()} 10002`;
};
