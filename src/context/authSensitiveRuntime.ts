export interface ClearSensitiveRuntimeStateOptions {
  removeLocalSecret?: boolean;
}

export interface AuthSensitiveRuntime {
  clearSensitiveRuntimeState: (
    userId: string,
    options?: ClearSensitiveRuntimeStateOptions,
  ) => Promise<void>;
}

let runtime: AuthSensitiveRuntime | undefined;

export const configureAuthSensitiveRuntime = (nextRuntime: AuthSensitiveRuntime): void => {
  runtime = nextRuntime;
};

export const clearAuthSensitiveRuntimeState = async (
  userId: string,
  options: ClearSensitiveRuntimeStateOptions = {},
): Promise<void> => {
  if (!userId) return;
  if (!runtime) {
    throw new Error('Auth sensitive runtime has not been configured by the application.');
  }
  await runtime.clearSensitiveRuntimeState(userId, options);
};
