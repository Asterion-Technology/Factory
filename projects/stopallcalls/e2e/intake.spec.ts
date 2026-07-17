import { expect, test, type Page } from '@playwright/test';

// Full consumer journey with fake providers: verify email → profile →
// agencies → review → submit. Fixture data is fictitious (SRS test-data rule).
// Emails are unique per test+project so parallel runs never share an intake.

// UUID, not Date.now()+counter: parallel workers each get their own module
// instance, so counters reset and timestamps can collide across workers —
// a shared email means a shared intake and cross-test bleed.
function uniqueEmail(testInfo: { project: { name: string } }): string {
  return `e2e-${testInfo.project.name}-${crypto.randomUUID()}@example.test`;
}

async function verifyEmail(page: Page, email: string): Promise<void> {
  // exact: the enclosing form's aria-label "Verify your email" would also match.
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('Verification code', { exact: true })).toBeVisible();
  const res = await page.request.get(`/api/dev/last-code?email=${encodeURIComponent(email)}`);
  expect(res.ok()).toBeTruthy();
  const { code } = (await res.json()) as { code: string };
  await page.getByLabel('Verification code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByLabel('First name')).toBeVisible();
}

async function fillProfile(page: Page): Promise<void> {
  await page.getByLabel('First name').fill('Taylor');
  await page.getByLabel('Last name').fill('Testcase');
  await page.getByLabel('Date of birth').fill('1985-06-15');
  await page.getByLabel('Mobile phone').fill('+15555550100');
  await page.getByLabel('Street address').fill('123 Fictional Avenue');
  await page.getByLabel('City').fill('Sampleville');
  await page.getByLabel('Province / State').fill('ON');
  await page.getByLabel('Postal / ZIP code').fill('A1A 1A1');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByLabel('Collection agency name')).toBeVisible();
}

async function addAgency(page: Page, name: string): Promise<void> {
  await page.getByLabel('Collection agency name').fill(name);
  await page.getByLabel('Phone', { exact: true }).check();
  await page.getByRole('button', { name: '+ Add this agency' }).click();
  await expect(page.locator('.agency-list')).toContainText(name);
}

const PNG_FILE = {
  name: 'proof-screenshot.png',
  mimeType: 'image/png',
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]),
};

async function goToEvidenceStep(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continue to proof upload' }).click();
  await expect(page.getByLabel('What is this file?')).toBeVisible();
}

test('landing page leads into the intake wizard (INT-001)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Stop Collection Calls' })).toBeVisible();
  await page.getByRole('link', { name: 'Start Intake' }).click();
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});

test('full intake: verify, profile, multiple agencies, submit (INT-002..008)', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo);
  await page.goto('/intake');
  await verifyEmail(page, email);

  // The verified email prefills the profile.
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await fillProfile(page);

  await addAgency(page, 'ABC Collections (Fictitious)');
  await addAgency(page, 'XYZ Recovery (Fictitious)');

  // Remove the second agency; the first remains (INT-004 add/remove).
  await page
    .locator('.agency-list li', { hasText: 'XYZ Recovery (Fictitious)' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.locator('.agency-list li')).toHaveCount(1);

  // Proof upload: a clean PNG is scanned and accepted (EVD-004/005).
  await goToEvidenceStep(page);
  await page.getByLabel('Choose a file (PDF, image, audio, or text)').setInputFiles(PNG_FILE);
  await expect(page.getByRole('list', { name: 'Uploaded files' })).toContainText('proof-screenshot.png — accepted');

  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByText('1 proof file')).toBeVisible();
  for (const label of [
    'I confirm I am the consumer.',
    'I confirm I am being contacted by the listed collection agency or agencies.',
    'I confirm the information I provided is true.',
    'I authorize the firm to send a limited-scope cease-and-desist / communication letter.',
  ]) {
    await page.getByLabel(label).check();
  }
  await page.getByRole('button', { name: 'Submit intake' }).click();
  await expect(page.getByRole('heading', { name: 'Intake received' })).toBeVisible();
});

test('save/resume: progress survives a reload (INT-002, INT-006)', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo);
  await page.goto('/intake');
  await verifyEmail(page, email);
  await fillProfile(page);
  await addAgency(page, 'Resume Collections (Fictitious)');

  await page.reload();
  // The session cookie resumes the same intake at the agencies step.
  await expect(page.locator('.agency-list')).toContainText('Resume Collections (Fictitious)');
});

test('duplicate prevention: a submitted intake cannot be restarted (INT-007, INT-008)', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo);
  await page.goto('/intake');
  await verifyEmail(page, email);
  await fillProfile(page);
  await addAgency(page, 'Once Collections (Fictitious)');
  await goToEvidenceStep(page);
  await page.getByRole('button', { name: 'Continue to review' }).click();
  for (const checkbox of await page.getByRole('checkbox').all()) {
    await checkbox.check();
  }
  await page.getByRole('button', { name: 'Submit intake' }).click();
  await expect(page.getByRole('heading', { name: 'Intake received' })).toBeVisible();

  // Returning to the wizard shows the submitted state — no second draft.
  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'Intake received' })).toBeVisible();
});

test('malicious upload is blocked and discarded (EVD-005)', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo);
  await page.goto('/intake');
  await verifyEmail(page, email);
  await fillProfile(page);
  await addAgency(page, 'Scan Collections (Fictitious)');
  await goToEvidenceStep(page);
  await page.getByLabel('What is this file?').selectOption('CALL_LOG');
  await page.getByLabel('Choose a file (PDF, image, audio, or text)').setInputFiles({
    name: 'call-log.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('call log 2026-07-01 FAKE-MALWARE-SIGNATURE'),
  });
  // .error, not role=alert: Next's route announcer also carries role=alert.
  await expect(page.locator('p.error')).toContainText('failed our safety scan');
  await expect(page.getByRole('list', { name: 'Uploaded files' })).toContainText('blocked by safety scan');
  // The blocked file never counts as proof.
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByText('0 proof files')).toBeVisible();
});

test('intake API rejects unverified sessions (INT-002 server-side)', async ({ page }) => {
  await page.goto('/');
  const res = await page.request.post('/api/intakes');
  expect(res.status()).toBe(401);
});
