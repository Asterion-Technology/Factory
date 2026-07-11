import type { Metadata } from 'next';
import IntakeWizard from './IntakeWizard';

export const metadata: Metadata = {
  title: 'Start Intake — StopAllCalls',
  robots: { index: false },
};

export default function IntakePage() {
  return (
    <main>
      <h1>Start your intake</h1>
      <p>
        Your progress is saved after each step — you can safely close this page and return later
        from the same browser.
      </p>
      <IntakeWizard />
    </main>
  );
}
