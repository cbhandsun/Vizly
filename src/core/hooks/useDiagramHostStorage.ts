import { useState, useCallback, useEffect } from 'react';
import {
    addRecentDiagramId,
    readFavoriteDiagramIds,
    readRecentDiagramIds,
    readSelectedDiagramId,
    toggleFavoriteDiagramId,
    writeFavoriteDiagramIds,
    writeSelectedDiagramId,
} from './diagramHostStorage';

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
        return readSelectedDiagramId(defaultId);
    });

    const saveSelectedDiagramId = useCallback((id: string) => {
        const normalizedId = writeSelectedDiagramId(id);
        if (normalizedId) setSelectedDiagramId(normalizedId);
    }, []);

    // 2. Recent Diagrams
    const [recentDiagrams, setRecentDiagrams] = useState<string[]>(() => {
        return readRecentDiagramIds();
    });

    const addRecentDiagram = useCallback((id: string) => {
        setRecentDiagrams(prev => {
            const next = addRecentDiagramId(id, prev);
            window.dispatchEvent(new CustomEvent('diagramMenuRecentChanged'));
            return next;
        });
    }, []);

    // 3. Favorites (Shared)
    const [favoriteDiagrams, setFavoriteDiagrams] = useState<string[]>(() => {
        return readFavoriteDiagramIds();
    });

    useEffect(() => {
        const onFavChanged = () => {
            setFavoriteDiagrams(readFavoriteDiagramIds());
        };
        window.addEventListener('diagramMenuFavoritesChanged', onFavChanged);
        return () => window.removeEventListener('diagramMenuFavoritesChanged', onFavChanged);
    }, []);

    const toggleFavorite = useCallback((id: string) => {
        setFavoriteDiagrams(prev => {
            const next = toggleFavoriteDiagramId(id, prev);
            window.dispatchEvent(new CustomEvent('diagramMenuFavoritesChanged'));
            return next;
        });
    }, []);

    const clearFavorites = useCallback(() => {
        setFavoriteDiagrams(writeFavoriteDiagramIds([]));
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
