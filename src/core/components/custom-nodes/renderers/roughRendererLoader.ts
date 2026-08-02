type RoughRenderer = typeof import('roughjs')['default'];
type RendererModule<Renderer> = { default: Renderer };
type RendererImporter<Renderer> = () => Promise<RendererModule<Renderer>>;

export const createRoughRendererLoader = <Renderer>(importRenderer: RendererImporter<Renderer>) => {
  let pending: Promise<Renderer> | null = null;

  return (): Promise<Renderer> => {
    if (!pending) {
      pending = importRenderer()
        .then(module => module.default)
        .catch((error: unknown) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };
};

export const loadRoughRenderer = createRoughRendererLoader<RoughRenderer>(() => import('roughjs'));
