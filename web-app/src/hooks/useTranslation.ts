import { useTranslation } from 'react-i18next';
import { setUserLanguage, getStoredLanguage } from '../i18n';
import { useEffect } from 'react';

export type TranslationKey = string;

export function useTypedTranslation(userLanguage: string | null = null) {
  const { t: i18nT, i18n } = useTranslation();

  useEffect(() => {
    if (userLanguage !== null) {
      setUserLanguage(userLanguage);
    }
  }, [userLanguage]);

  return {
    // allow any string key and optional options (fallbacks) to support dynamic keys
    t: (key: string, options?: any) => {
      const res = i18nT(key as any, options);
      return typeof res === 'string' ? res : String(res);
    },
    i18n,
    changeLanguage: setUserLanguage,
    currentLanguage: i18n.language as 'en' | 'de',
    isGerman: i18n.language === 'de',
    isEnglish: i18n.language === 'en'
  };
}