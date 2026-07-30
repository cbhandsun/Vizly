import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { syncDocumentLanguage } from './core/utils/languagePreference';

// Import translation files
import en from './locales/en.json';
import zh from './locales/zh.json';

const resources = {
    en: {
        translation: en,
    },
    zh: {
        translation: zh,
    },
};

i18n
    // detect user language
    // learn more: https://github.com/i18next/i18next-browser-languagedetector
    .use(LanguageDetector)
    // pass the i18n instance to react-i18next.
    .use(initReactI18next)
    // init i18next
    // for all options read: https://www.i18next.com/overview/configuration-options
    .init({
        resources,
        fallbackLng: 'en',
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
