import React, { Suspense, lazy, type ComponentType } from 'react';

type NodeRendererModule<Props extends object> = {
  default: ComponentType<Props>;
};

/**
 * Keeps optional node renderers out of the initial diagram bundle while
 * containing their loading state to the individual node.
 */
export const createLazyNodeRenderer = <Props extends object>(
  load: () => Promise<NodeRendererModule<Props>>,
): ComponentType<Props> => {
  const LazyNodeRenderer = lazy(load);

  const DeferredNodeRenderer = (props: Props) => (
    <Suspense fallback={null}>
      <LazyNodeRenderer {...props} />
    </Suspense>
  );

  DeferredNodeRenderer.displayName = 'DeferredNodeRenderer';
  return DeferredNodeRenderer;
};
