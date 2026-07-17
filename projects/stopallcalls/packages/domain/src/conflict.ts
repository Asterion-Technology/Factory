// CLIO-002: the conflict-search package — every term a human reviewer (and
// the Clio search) must consider before an intake may proceed. Pure domain
// code; structural input so this package gains no new dependencies.

export type ConflictTermType =
  | 'CONSUMER_NAME'
  | 'ALIAS'
  | 'EMAIL'
  | 'PHONE'
  | 'AGENCY'
  | 'CREDITOR'
  | 'DEBT_BUYER'
  | 'RELATED_COMPANY';

export interface ConflictSearchTerm {
  type: ConflictTermType;
  value: string;
}

export interface ConflictSearchInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  aliases?: readonly string[];
  agencies: readonly {
    agencyName: string;
    originalCreditor?: string | null;
    debtBuyer?: string | null;
  }[];
  relatedCompanies?: readonly string[];
}

export function buildConflictSearchPackage(input: ConflictSearchInput): ConflictSearchTerm[] {
  const terms: ConflictSearchTerm[] = [];
  const seen = new Set<string>();
  const push = (type: ConflictTermType, raw: string | null | undefined): void => {
    const value = raw?.trim();
    if (!value) return;
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ type, value });
  };

  push('CONSUMER_NAME', `${input.firstName.trim()} ${input.lastName.trim()}`);
  for (const alias of input.aliases ?? []) push('ALIAS', alias);
  push('EMAIL', input.email);
  push('PHONE', input.phone);
  for (const agency of input.agencies) {
    push('AGENCY', agency.agencyName);
    push('CREDITOR', agency.originalCreditor);
    push('DEBT_BUYER', agency.debtBuyer);
  }
  for (const company of input.relatedCompanies ?? []) push('RELATED_COMPANY', company);
  return terms;
}
