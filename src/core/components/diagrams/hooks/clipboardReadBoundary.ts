export const SYSTEM_CLIPBOARD_READ_TIMEOUT_MS = 1_000;

export const readClipboardTextWithTimeout = (
  readText: () => Promise<string>,
  timeoutMs = SYSTEM_CLIPBOARD_READ_TIMEOUT_MS,
): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, timeoutMs, null);
    readText().then(resolve, reject);
  });
};
