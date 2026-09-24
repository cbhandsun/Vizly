import { logShareDialogClipboardFailure } from './shareDialogLogging';

const MAX_SHARE_URL_LENGTH = 4096;

export const isSafeShareUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SHARE_URL_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

export const tryCopyShareUrl = async (
  url: unknown,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = (
    typeof navigator === 'undefined' ? undefined : navigator.clipboard
  ),
): Promise<boolean> => {
  if (!isSafeShareUrl(url) || !clipboard?.writeText) return false;
  try {
    await clipboard.writeText(url);
    return true;
  } catch (error) {
    logShareDialogClipboardFailure(error);
    return false;
  }
};
