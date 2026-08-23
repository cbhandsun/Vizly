import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {
    coerceSupportedLanguage,
    syncDocumentLanguage,
    type SupportedLanguageCode,
} from './core/utils/languagePreference';

const localeLoaders: Record<SupportedLanguageCode, () => Promise<Record<string, unknown>>> = {
    en: () => import('./locales/en.json').then(module => module.default),
    zh: () => import('./locales/zh.json').then(module => module.default),
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

i18n
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
    });

i18n.on('languageChanged', (language) => {
    syncDocumentLanguage(language, typeof document === 'undefined' ? null : document);
});

syncDocumentLanguage(
    i18n.resolvedLanguage || i18n.language,
    typeof document === 'undefined' ? null : document,
);

export default i18n;
