import React, { useState } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';

import AppProviders from './providers';
import AppRoutes from './routes';

const createAppRouter = () => createHashRouter([{
  path: '*',
  element: (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  ),
}]);

/** Data-router composition keeps HashRouter URLs while enabling route blockers. */
const AppRouter: React.FC = () => {
  const [router] = useState(createAppRouter);
  return <RouterProvider router={router} />;
};

export default AppRouter;
