import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './ja.json';
import en from './en.json';

const LANGUAGE_KEY = 'portal-language';

i18n
  .use(initReactI18next)
  .init({
    resources: { ja: { translation: ja }, en: { translation: en } },
    lng: (localStorage.getItem(LANGUAGE_KEY) as 'ja' | 'en' | null) ?? 'ja',
    fallbackLng: 'ja',
    interpolation: { escapeValue: false },
  });

export default i18n;
