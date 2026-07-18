// FICTITIOUS test data only (DEV-004). Every value is invented; example.test
// domains and 555 phone numbers cannot reach real people. Never add real PII.

import type { AgencyEntry, ConsumerProfile } from '@stopallcalls/contracts';

export const FICTITIOUS_PROFILE: ConsumerProfile = {
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
};

export const FICTITIOUS_AGENCIES: AgencyEntry[] = [
  {
    agencyName: 'ABC Collections (Fictitious)',
    agencyPhone: '+15555550111',
    agencyEmail: 'contact@abc-collections.example.test',
    agencyMailingAddress: '1 Imaginary Plaza, Sampleville, ON',
    originalCreditor: 'Example Bank (Fictitious)',
    debtBuyer: null,
    accountNumberLast4: '4321',
    amountClaimedCents: 154250,
    currency: 'CAD',
    dateFirstContacted: '2026-01-10',
    dateLastContacted: '2026-06-30',
    contactChannels: ['PHONE', 'LETTER'],
    stillContacting: true,
    contactFrequency: 'Several calls per week',
    allegations: ['WORKPLACE_CALLS'],
  },
  {
    agencyName: 'XYZ Recovery Services (Fictitious)',
    agencyPhone: null,
    agencyEmail: null,
    agencyMailingAddress: null,
    originalCreditor: 'Example Telecom (Fictitious)',
    debtBuyer: 'Example Debt Buyers Inc. (Fictitious)',
    accountNumberLast4: null,
    amountClaimedCents: 38900,
    currency: 'CAD',
    dateFirstContacted: '2026-03-02',
    dateLastContacted: null,
    contactChannels: ['TEXT', 'EMAIL'],
    stillContacting: null,
    contactFrequency: null,
    allegations: [],
  },
];
