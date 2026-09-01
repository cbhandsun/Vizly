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

declare module 'virtual:vizly-elk-engine-worker-url' {
    const workerUrl: string;
    export default workerUrl;
}

declare module 'virtual:vizly-pdf-font-url' {
    const fontUrl: string;
    export default fontUrl;
}

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

interface Window {
    __currentUserId?: string | null;
    __vizlyDisplayRoutingDiagnosticsEnabled?: boolean;
    __flowDesignerOpenCloud?: (
        data: import('./core/models/DiagramModels').StandardDiagramData,
    ) => void | Promise<void>;
}
