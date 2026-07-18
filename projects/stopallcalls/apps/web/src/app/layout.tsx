import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'StopAllCalls — Stop Collection Calls',
  description:
    'We prepare and send a lawyer-issued cease-and-desist communication letter to collection agencies contacting you.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
