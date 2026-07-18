import type { NextRequest } from 'next/server';
import type { GateSnapshot } from '@stopallcalls/domain';
import {
  InMemoryClioMappingStore,
  InMemoryConflictCheckStore,
  InMemoryMatterStore,
  provisionClioForIntake,
  recordConflictDisposition,
  runConflictCheck,
  type IntakeRecord,
} from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled, getRealClioAdapter } from '@/lib/clio';

// One-shot integration write test (human-approved): drives the full Phase 3
// pipeline — conflict check, human disposition, gated idempotent provisioning
// — against the REAL Clio tenant with clearly-fictitious fixture data.
// Same interim admin gate as the connect flow; requires ?confirm=create.
// The created records are visible in Clio and safe to delete there.

const FIXTURE_AGENCY_ID = 'write-test-agency-1';

const fixtureIntake = (): IntakeRecord => ({
  id: 'write-test-intake-fixture',
  consumerKey: 'write-test@example.test',
  jurisdiction: 'CA',
  state: 'SUBMITTED',
  profile: null,
  agencies: [],
  submittedSnapshot: {
    submittedAt: new Date().toISOString(),
    profile: {
      firstName: 'Taylor',
      lastName: 'Testcase',
      dateOfBirth: '1985-06-15',
      email: 'taylor.testcase@example.test',
      phone: '+15555550100',
      address: {
        line1: '123 Fictional Avenue',
        city: 'Sampleville',
        region: 'ON',
        postalCode: 'A1A 1A1',
        country: 'CA',
      },
      preferredContactMethod: 'EMAIL',
    },
    agencies: [
      {
        id: FIXTURE_AGENCY_ID,
        entry: {
          agencyName: 'ABC Collections (Fictitious)',
          currency: 'CAD',
          contactChannels: ['PHONE'],
          allegations: [],
        },
      },
    ],
    attestations: { isConsumer: true, contactConfirmed: true, informationTrue: true, authorizeLetter: true },
  },
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const ALL_PASSED: GateSnapshot = Object.fromEntries(
  ['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER', 'PAYMENT', 'LEGAL_APPROVAL'].map((gate) => [
    gate,
    { gate, status: 'PASSED' },
  ]),
) as unknown as GateSnapshot;

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    if (req.nextUrl.searchParams.get('confirm') !== 'create') {
      return jsonError(422, 'CONFIRM_REQUIRED', 'Pass ?confirm=create to run the write test.');
    }
    const reviewer = req.nextUrl.searchParams.get('reviewer')?.trim();
    if (!reviewer) return jsonError(422, 'REVIEWER_REQUIRED', 'Pass ?reviewer=<human name>.');

    const clio = getRealClioAdapter();
    const stores = {
      conflicts: new InMemoryConflictCheckStore(),
      matters: new InMemoryMatterStore(),
      mappings: new InMemoryClioMappingStore(),
    };
    const intake = fixtureIntake();

    const check = await runConflictCheck(stores.conflicts, clio, intake);
    await recordConflictDisposition(stores.conflicts, check.id, {
      disposition: 'CLEAR',
      reviewedBy: reviewer,
      rationale: 'Integration write test with fictitious data; approved in session.',
    });
    const first = await provisionClioForIntake(stores, clio, intake, ALL_PASSED);
    // Idempotency against the real tenant: a second run must change nothing.
    const second = await provisionClioForIntake(stores, clio, intake, ALL_PASSED);

    return jsonOk({
      conflictTerms: check.terms.length,
      conflictHits: check.hits.length,
      contactClioId: first.contactClioId,
      matters: first.matters.map((m) => ({ displayNumber: m.displayNumber, state: m.state })),
      retryIdentical:
        second.contactClioId === first.contactClioId &&
        second.matters.length === first.matters.length,
    });
  });
}
