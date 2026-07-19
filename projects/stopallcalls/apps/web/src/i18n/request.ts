// RAD-17 build 5: bilingual EN/FR via next-intl in cookie mode — no [locale]
// URL restructure (E2E paths and deep links stay stable). The switcher sets
// NEXT_LOCALE; unknown/absent values fall back to English.

import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['en', 'fr'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export default getRequestConfig(async () => {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = raw === 'fr' ? 'fr' : 'en';
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
