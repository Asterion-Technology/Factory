'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

// Cookie-mode locale switch: set NEXT_LOCALE and refresh — server components
// re-render in the new language, URLs unchanged.
export default function LocaleSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('common');

  const set = (next: 'en' | 'fr') => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <div className="locale-switcher" aria-label={t('language')}>
      <button className={`link${locale === 'en' ? ' locale-active' : ''}`} onClick={() => set('en')}>
        {t('english')}
      </button>
      {' · '}
      <button className={`link${locale === 'fr' ? ' locale-active' : ''}`} onClick={() => set('fr')}>
        {t('french')}
      </button>
    </div>
  );
}
