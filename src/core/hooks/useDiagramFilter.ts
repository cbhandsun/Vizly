import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DiagramDefinition } from '../types/diagram-components';

export interface DiagramFilterState {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    selectedTags: string[];
    setSelectedTags: (tags: string[] | ((prev: string[]) => string[])) => void;
    matchMode: 'any' | 'all';
    setMatchMode: (mode: 'any' | 'all') => void;
    filteredDiagrams: DiagramDefinition[];
    tagStats: { allTags: string[]; counts: Map<string, number> };
}

export const useDiagramFilter = (diagrams: DiagramDefinition[]): DiagramFilterState => {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [matchMode, setMatchMode] = useState<'any' | 'all'>('any');

    const tagStats = useMemo(() => {
        const counts = new Map<string, number>();
        for (const d of diagrams) {
            for (const t of d.tags || []) {
                counts.set(t, (counts.get(t) || 0) + 1);
            }
        }
        const allTags = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
        return { allTags, counts };
    }, [diagrams]);

    const filteredDiagrams = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return diagrams.filter((diagram: DiagramDefinition) => {
            // 排除 debug 分类 (consistent with original logic)
            if (diagram.category === 'debug') return false;

            const displayName = diagram.titleKey ? t(diagram.titleKey) : diagram.name;
            const nameMatch = term ? displayName.toLowerCase().includes(term) : true;
            const tags = diagram.tags || [];
            const tagMatch = selectedTags.length === 0
                ? true
                : matchMode === 'any'
                    ? selectedTags.some(t => tags.includes(t))
                    : selectedTags.every(t => tags.includes(t));
            return nameMatch && tagMatch;
        });
    }, [diagrams, searchTerm, selectedTags, matchMode, t]);

    return {
        searchTerm,
        setSearchTerm,
        selectedTags,
        setSelectedTags,
        matchMode,
        setMatchMode,
        filteredDiagrams,
        tagStats
    };
};
