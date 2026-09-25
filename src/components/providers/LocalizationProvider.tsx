'use client';

import { ReactNode, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/localization/i18n';
import { useLocalStorage } from '@/hooks/useLocalStorage'; // Assuming a generic hook exists or use window.localStorage directly

interface LocalizationProviderProps {
  children: ReactNode;
}

export function LocalizationProvider({ children }: LocalizationProviderProps) {
  const [savedLanguage, setSavedLanguage] = useLocalStorage<string>('locale', 'en');

  useEffect(() => {
    if (i18n.language !== savedLanguage) {
      i18n.changeLanguage(savedLanguage);
    }
  }, [savedLanguage]);

  const changeLanguage = (lng: string) => {
    setSavedLanguage(lng);
    i18n.changeLanguage(lng);
  };

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}