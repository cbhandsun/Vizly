import React from 'react';
import { safeLog } from '../../utils/consoleCleanup';

export const useErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    safeLog.error('Error captured by useErrorHandler:', error);
    setError(error);
  }, []);

  if (error) {
    throw error;
  }

  return { captureError, resetError };
};
