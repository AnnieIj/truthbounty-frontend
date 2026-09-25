import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

export function useLocalization() {
  const { t, i18n } = useTranslation();

  const changeLanguage = useCallback(
    (lng: string) => {
      i18n.changeLanguage(lng);
    },
    [i18n],
  );

  return {
    t,
    i18n,
    language: i18n.language,
    changeLanguage,
  };
}