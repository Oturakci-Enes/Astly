import { createContext, useContext, useState, useCallback } from 'react';
import tr from '../locales/tr';
import en from '../locales/en';

const LOCALES = { tr, en };
const STORAGE_KEY = 'workos_locale';

const LocaleContext = createContext();

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'en'; }
    catch { return 'en'; }
  });

  const strings = LOCALES[locale] || en;

  const t = useCallback((key, fallback) => {
    return strings[key] ?? LOCALES.en[key] ?? fallback ?? key;
  }, [strings]);

  const fmtDate = useCallback((dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(strings._locale, strings._dateFormat);
  }, [strings]);

  const fmtTime = useCallback((dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString(strings._locale, { hour:'2-digit', minute:'2-digit' });
  }, [strings]);

  const setLocale = useCallback((newLocale) => {
    if (LOCALES[newLocale]) {
      setLocaleState(newLocale);
      try { localStorage.setItem(STORAGE_KEY, newLocale); } catch {}
    }
  }, []);

  const value = {
    locale,
    setLocale,
    t,
    fmtDate,
    fmtTime,
    localeCode: strings._locale,
    availableLocales: [
      { code: 'tr', label: 'Türkçe (TR)', flag: '🇹🇷' },
      { code: 'en', label: 'English (UK)', flag: '🇬🇧' },
    ],
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
