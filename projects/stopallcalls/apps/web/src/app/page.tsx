import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import LocaleSwitcher from '@/components/LocaleSwitcher';

// INT-001 landing content — first surface on the RAD-17 i18n pattern: all
// copy lives in messages/{en,fr}.json. Placeholder strings still require
// counsel approval before production (docs/BUILD_PLAN.md open decisions);
// the FR file marks every legal string as draft pending lawyer approval.
export default async function LandingPage() {
  const t = await getTranslations('landing');
  return (
    <main>
      <LocaleSwitcher />
      <h1>{t('title')}</h1>
      <p>{t('lead')}</p>
      <Link className="cta" href="/intake">
        {t('startIntake')}
      </Link>
      <div className="disclaimer">
        <p>{t('disclaimerScope')}</p>
        <p>{t('disclaimerLinks')}</p>
      </div>
    </main>
  );
}
