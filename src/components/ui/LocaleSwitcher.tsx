'use client';

import { useLocalization } from '@/hooks/useLocalization';
import { useTranslation } from 'react-i18next';

export function LocaleSwitcher() {
  const { t } = useTranslation();
  const { language, changeLanguage } = useLocalization();

  const languages = [
    { code: 'en', label: t('locale.en') },
    { code: 'es', label: t('locale.es') },
  ];

  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('locale.switch')}>
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => changeLanguage(lang.code)}
          className={`px-2 py-1 text-sm rounded ${
            language === lang.code
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
          aria-pressed={language === lang.code}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}