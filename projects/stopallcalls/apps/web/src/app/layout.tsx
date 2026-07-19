import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stops All Calls — Stop Collection Calls',
  description:
    'We prepare and send a lawyer-issued cease-and-desist communication letter to collection agencies contacting you.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
