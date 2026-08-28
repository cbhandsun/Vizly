import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enLocaleUrl from './locales/en.json?url';
import zhLocaleUrl from './locales/zh.json?url';
import {
    coerceSupportedLanguage,
    syncDocumentLanguage,
    type SupportedLanguageCode,
} from './core/utils/languagePreference';
import { loadLocaleResource } from './services/localeResourceBoundary';

const localeLoaders: Record<SupportedLanguageCode, () => Promise<Record<string, unknown>>> = {
    en: () => loadLocaleResource(enLocaleUrl),
    zh: () => loadLocaleResource(zhLocaleUrl),
};

const localeBackend: BackendModule = {
    type: 'backend',
    init: () => undefined,
    read: (language, _namespace, callback) => {
        const supportedLanguage = coerceSupportedLanguage(language);
        void localeLoaders[supportedLanguage]().then(
            resources => callback(null, resources),
            error => callback(error instanceof Error ? error : new Error('locale-load-failed'), false),
        );
    },
};

export const i18nReady: Promise<void> = i18n
    // detect user language
    // learn more: https://github.com/i18next/i18next-browser-languagedetector
    .use(LanguageDetector)
    .use(localeBackend)
    // pass the i18n instance to react-i18next.
    .use(initReactI18next)
    // init i18next
    // for all options read: https://www.i18next.com/overview/configuration-options
    .init({
        fallbackLng: false,
        supportedLngs: ['en', 'zh'],
        nonExplicitSupportedLngs: true,
        load: 'languageOnly',
        debug: process.env.NODE_ENV === 'development',

        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        },
    })
    .then(() => undefined, () => undefined);

i18n.on('languageChanged', (language) => {
    syncDocumentLanguage(language, typeof document === 'undefined' ? null : document);
});

syncDocumentLanguage(
    i18n.resolvedLanguage || i18n.language,
    typeof document === 'undefined' ? null : document,
);

export default i18n;
