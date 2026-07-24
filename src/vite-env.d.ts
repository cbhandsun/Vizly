/// <reference types="vite/client" />

// Vite Worker type declarations
declare module '*?worker&inline' {
    const workerConstructor: {
        new (): Worker;
    };
    export default workerConstructor;
}

declare module '*?worker' {
    const workerConstructor: {
        new (): Worker;
    };
    export default workerConstructor;
}

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

interface Window {
    __flowDesignerOpenCloud?: (
        data: import('./core/models/DiagramModels').StandardDiagramData,
    ) => void | Promise<void>;
}
