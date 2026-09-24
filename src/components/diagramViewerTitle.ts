import { getStandardPresetCatalogItemById } from '@/data/standardized/presetMetadata';

const MAX_DIAGRAM_TITLE_LENGTH = 240;

const asRecord = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

export const normalizeDiagramTitle = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const withoutControlCharacters = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? ' ' : character;
  }).join('');
  const normalized = withoutControlCharacters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DIAGRAM_TITLE_LENGTH);
  return normalized || undefined;
};

export const getPersistedDiagramTitle = (value: unknown): string | undefined => {
  const diagram = asRecord(value);
  if (!diagram) return undefined;
  const metadata = asRecord(diagram.metadata);
  return normalizeDiagramTitle(metadata?.title) ?? normalizeDiagramTitle(diagram.name);
};

interface DiagramTitleDefinition {
  name?: string;
  titleKey?: string;
}

interface LoadedDiagramTitle {
  diagramId: string;
  name?: string;
}

interface ResolveDiagramViewerTitleOptions {
  selectedDiagramId: string;
  selectedDiagram?: DiagramTitleDefinition;
  loadedDiagram?: LoadedDiagramTitle | null;
  translate: (key: string, fallback?: string) => string;
}

export const resolveDiagramViewerTitle = ({
  selectedDiagramId,
  selectedDiagram,
  loadedDiagram,
  translate,
}: ResolveDiagramViewerTitleOptions): string => {
  if (selectedDiagram?.titleKey) return translate(selectedDiagram.titleKey);
  if (selectedDiagram?.name) return selectedDiagram.name;
  if (loadedDiagram?.diagramId === selectedDiagramId && loadedDiagram.name) {
    return loadedDiagram.name;
  }

  const standardPreset = getStandardPresetCatalogItemById(selectedDiagramId);
  if (standardPreset) {
    return translate(standardPreset.titleKey, standardPreset.fallbackTitle);
  }

  return translate('workspace.untitledDiagram');
};
