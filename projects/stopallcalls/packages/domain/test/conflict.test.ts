import { describe, expect, it } from 'vitest';
import { buildConflictSearchPackage } from '../src/index';

const INPUT = {
  firstName: ' Taylor ',
  lastName: 'Testcase',
  email: 'taylor.testcase@example.test',
  phone: '+15555550100',
  agencies: [
    { agencyName: 'ABC Collections (Fictitious)', originalCreditor: 'Fictional Bank', debtBuyer: null },
    { agencyName: 'abc collections (fictitious)', originalCreditor: 'Fictional Bank' },
    { agencyName: 'XYZ Recovery (Fictitious)' },
  ],
};

describe('buildConflictSearchPackage (CLIO-002)', () => {
  it('covers name, email, phone, agencies, creditors', () => {
    const terms = buildConflictSearchPackage(INPUT);
    expect(terms).toContainEqual({ type: 'CONSUMER_NAME', value: 'Taylor Testcase' });
    expect(terms).toContainEqual({ type: 'EMAIL', value: 'taylor.testcase@example.test' });
    expect(terms).toContainEqual({ type: 'PHONE', value: '+15555550100' });
    expect(terms).toContainEqual({ type: 'AGENCY', value: 'ABC Collections (Fictitious)' });
    expect(terms).toContainEqual({ type: 'CREDITOR', value: 'Fictional Bank' });
    expect(terms).toContainEqual({ type: 'AGENCY', value: 'XYZ Recovery (Fictitious)' });
  });

  it('dedupes case-insensitively per term type and skips blanks', () => {
    const terms = buildConflictSearchPackage(INPUT);
    expect(terms.filter((t) => t.type === 'AGENCY')).toHaveLength(2);
    expect(terms.filter((t) => t.type === 'CREDITOR')).toHaveLength(1);
    expect(terms.filter((t) => t.type === 'DEBT_BUYER')).toHaveLength(0);
  });

  it('includes aliases and related companies when provided', () => {
    const terms = buildConflictSearchPackage({
      ...INPUT,
      aliases: ['T. Testcase'],
      relatedCompanies: ['ABC Holdings (Fictitious)'],
    });
    expect(terms).toContainEqual({ type: 'ALIAS', value: 'T. Testcase' });
    expect(terms).toContainEqual({ type: 'RELATED_COMPANY', value: 'ABC Holdings (Fictitious)' });
  });
});
