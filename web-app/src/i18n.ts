import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import deTranslations from './locales/de.json';

const resources = {
  en: {
    translation: enTranslations
  },
  de: {
    translation: deTranslations
  }
};

export function getStoredLanguage(): string | null {
  try {
    const stored = localStorage.getItem('zen_preferred_language');
    return stored;
  } catch {
    return null;
  }
}

export function storeLanguage(language: string | null) {
  try {
    if (language) {
      localStorage.setItem('zen_preferred_language', language);
    } else {
      localStorage.removeItem('zen_preferred_language');
    }
  } catch {
    console.warn('Failed to store language preference');
  }
}

export async function setUserLanguage(userLanguage: string | null): Promise<void> {
  const browserLang = navigator.language.split('-')[0];
  
  if (userLanguage && userLanguage !== 'auto') {
    await i18n.changeLanguage(userLanguage);
    storeLanguage(userLanguage);
  } else {
    const finalLang = browserLang === 'de' ? 'de' : 'en';
    await i18n.changeLanguage(finalLang);
    // For 'auto', don't persist the literal 'auto' value to localStorage so i18n won't try to use it as a language on load.
    storeLanguage(null);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      lookupLocalStorage: 'zen_preferred_language',
      caches: ['localStorage'],
    },
    
    interpolation: {
      escapeValue: false
    },

    supportedLngs: ['en', 'de', 'auto'],
    
    load: 'languageOnly'
  });

export default i18n;