export interface EdgeRoutingCoordinatorLifecycle {
  forceClearAllCaches: () => void;
  freeze: () => void;
  unfreeze: () => void;
}

export type EdgeRoutingCoordinatorLoader = () => Promise<EdgeRoutingCoordinatorLifecycle>;

let loadAdapter: EdgeRoutingCoordinatorLoader = async () => {
  throw new Error('Edge routing coordinator runtime has not been configured.');
};

export const configureEdgeRoutingCoordinatorRuntime = (
  loader: EdgeRoutingCoordinatorLoader,
): void => {
  loadAdapter = loader;
};

export const loadEdgeRoutingCoordinator = (): Promise<EdgeRoutingCoordinatorLifecycle> => (
  loadAdapter()
);
