import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  normalizeAppLanguage,
  readAppLanguage,
  translate,
  type AppLanguage,
  type MessageKey,
} from './messages';

const LANGUAGE_EVENT = 'streamlearn-language';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => readAppLanguage());

  const apply = useCallback((next: AppLanguage) => {
    document.documentElement.lang = next;
    window.localStorage.setItem('lang', next);
    setLanguageState(next);
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    apply(next);
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: next }));
  }, [apply]);

  useEffect(() => {
    document.documentElement.lang = language;
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'lang') setLanguageState(normalizeAppLanguage(event.newValue));
    };
    const onCustom = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      setLanguageState(normalizeAppLanguage(next));
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(LANGUAGE_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LANGUAGE_EVENT, onCustom);
    };
  }, [language]);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string>) => translate(language, key, vars),
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return value;
}
