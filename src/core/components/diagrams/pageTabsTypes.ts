import type { DiagramPage } from './hooks/useMultiPage';
export type { DiagramPage } from './hooks/useMultiPage';

export interface PageTabsProps {
    pages: DiagramPage[];
    activePageId: string;
    onSwitchPage: (id: string) => void;
    onAddPage: () => string | null;
    onDiscardPage?: (id: string) => boolean;
    onDeletePage: (id: string) => boolean;
    onRestoreDeletedPage?: () => string | null;
    onRenamePage: (id: string, name: string) => boolean;
    onDuplicatePage?: (id: string, preferredName: string) => string | null;
    onMovePage?: (id: string, direction: 'left' | 'right') => boolean;
    canRestoreDeletedPage?: boolean;
    restorableDeletedPageName?: string | null;
    activePageNodeCount?: number;
    activePageEdgeCount?: number;
    disabled?: boolean;
}
