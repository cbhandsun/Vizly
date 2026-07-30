export const SUPPORTED_LANGUAGE_CODES = ['en', 'zh'] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export interface DocumentLanguageTarget {
  documentElement: {
    lang: string;
  };
}

export const parseSupportedLanguage = (value: unknown): SupportedLanguageCode | null => {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return normalized === 'en' || normalized === 'zh' ? normalized : null;
};

export const coerceSupportedLanguage = (
  value: unknown,
  fallback: SupportedLanguageCode = 'en',
): SupportedLanguageCode => parseSupportedLanguage(value) ?? fallback;

export const syncDocumentLanguage = (
  value: unknown,
  target: DocumentLanguageTarget | null | undefined,
): SupportedLanguageCode => {
  const language = coerceSupportedLanguage(value);
  if (target) target.documentElement.lang = language;
  return language;
};
