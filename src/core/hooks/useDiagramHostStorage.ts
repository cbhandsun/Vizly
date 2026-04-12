import { useState, useCallback, useEffect } from 'react';

export interface DiagramHostStorage {
    selectedDiagramId: string;
    saveSelectedDiagramId: (id: string) => void;
    recentDiagrams: string[];
    addRecentDiagram: (id: string) => void;
    favoriteDiagrams: string[];
    toggleFavorite: (id: string) => void;
    clearFavorites: () => void;
}

/**
 * Hook to handle storage persistence for the Diagram Host/Viewer
 * Encapsulates logic for:
 * - Selected diagram ID persistence
 * - Recent diagrams list
 * - Favorite diagrams list (shared with menu)
 */
export const useDiagramHostStorage = (defaultId: string): DiagramHostStorage => {
    // 1. Selected Diagram ID
    const [selectedDiagramId, setSelectedDiagramId] = useState<string>(() => {
        try {
            const saved = localStorage.getItem('diagramMenu.selectedDiagramId');
            return saved || defaultId;
        } catch {
            return defaultId;
        }
    });

    const saveSelectedDiagramId = useCallback((id: string) => {
        setSelectedDiagramId(id);
        try {
            localStorage.setItem('diagramMenu.selectedDiagramId', id);
        } catch { void 0; }
    }, []);

    // 2. Recent Diagrams
    const [recentDiagrams, setRecentDiagrams] = useState<string[]>([]);

    // Load initial recent
    useEffect(() => {
        try {
            const raw = localStorage.getItem('diagramMenu.recent');
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) setRecentDiagrams(parsed.map(String));
        } catch { void 0; }
    }, []);

    const addRecentDiagram = useCallback((id: string) => {
        setRecentDiagrams(prev => {
            const next = [String(id), ...prev.filter(x => x !== String(id))].slice(0, 12);
            try {
                localStorage.setItem('diagramMenu.recent', JSON.stringify(next));
                window.dispatchEvent(new CustomEvent('diagramMenuRecentChanged'));
            } catch { void 0; }
            return next;
        });
    }, []);

    // 3. Favorites (Shared)
    const [favoriteDiagrams, setFavoriteDiagrams] = useState<string[]>([]);

    const loadFavorites = useCallback(() => {
        try {
            const raw = localStorage.getItem('diagramMenu.favorites');
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) setFavoriteDiagrams(parsed.map(String));
        } catch { void 0; }
    }, []);

    useEffect(() => {
        loadFavorites();
        const onFavChanged = () => loadFavorites();
        window.addEventListener('diagramMenuFavoritesChanged', onFavChanged);
        return () => window.removeEventListener('diagramMenuFavoritesChanged', onFavChanged);
    }, [loadFavorites]);

    const toggleFavorite = useCallback((id: string) => {
        const sid = String(id);
        setFavoriteDiagrams(prev => {
            const next = prev.includes(sid)
                ? prev.filter(x => x !== sid)
                : [sid, ...prev];

            try { localStorage.setItem('diagramMenu.favorites', JSON.stringify(next)); } catch { void 0; }
            window.dispatchEvent(new CustomEvent('diagramMenuFavoritesChanged'));
            return next;
        });
    }, []);

    const clearFavorites = useCallback(() => {
        setFavoriteDiagrams([]);
        try { localStorage.setItem('diagramMenu.favorites', JSON.stringify([])); } catch { void 0; }
        window.dispatchEvent(new CustomEvent('diagramMenuFavoritesChanged'));
    }, []);

    return {
        selectedDiagramId,
        saveSelectedDiagramId,
        recentDiagrams,
        addRecentDiagram,
        favoriteDiagrams,
        toggleFavorite,
        clearFavorites
    };
};
