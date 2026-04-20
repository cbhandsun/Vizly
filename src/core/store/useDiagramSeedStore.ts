import { create } from 'zustand';

interface DiagramSeedState {
    seedData: any | null;
    seedId: string | null;
    setSeed: (id: string, data: any) => void;
    consumeSeed: (id: string) => any | null;
}

export const useDiagramSeedStore = create<DiagramSeedState>((set, get) => ({
    seedData: null,
    seedId: null,
    setSeed: (id, data) => set({ seedId: id, seedData: data }),
    consumeSeed: (id) => {
        const state = get();
        if (state.seedId === id && state.seedData) {
            const data = state.seedData;
            // Clear the seed after consumption so it only applies once
            set({ seedId: null, seedData: null });
            return data;
        }
        return null;
    }
}));
