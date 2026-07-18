// Phase 5 (LTR-001/LTR-002): deterministic letter rendering from verified
// structured fields. Same template + same fields => byte-identical output;
// no free text, no AI (Phase 7 disabled by default).

/** Recorded on every letter version (LTR-005). Bump on any renderer change. */
export const LETTER_GENERATOR_VERSION = '1.0.0';

export class LetterRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LetterRenderError';
  }
}

/**
 * Substitutes `{{key}}` placeholders. Every placeholder must resolve — a
 * missing field is an error, never silent empty text in a legal letter.
 */
export function renderLetterTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const value = fields[key];
    if (value === undefined || value.trim() === '') {
      throw new LetterRenderError(`Letter field "${key}" is required but missing.`);
    }
    return value;
  });
}

export interface LetterFieldsInput {
  consumerFirstName: string;
  consumerLastName: string;
  agencyName: string;
  originalCreditor?: string;
  accountLast4?: string;
  amountClaimedCents?: number;
  currency?: string;
  matterDisplayNumber: string;
  /** Caller supplies the date so rendering stays deterministic. */
  letterDate: string;
}

/** LTR-001: only verified structured fields ever reach the template. */
export function buildLetterFields(input: LetterFieldsInput): Record<string, string> {
  const fields: Record<string, string> = {
    consumerName: `${input.consumerFirstName} ${input.consumerLastName}`,
    agencyName: input.agencyName,
    matterNumber: input.matterDisplayNumber,
    letterDate: input.letterDate,
  };
  if (input.originalCreditor) fields.originalCreditor = input.originalCreditor;
  if (input.accountLast4) fields.accountLast4 = input.accountLast4;
  if (input.amountClaimedCents !== undefined) {
    const dollars = (input.amountClaimedCents / 100).toFixed(2);
    fields.amountClaimed = `${dollars} ${input.currency ?? 'CAD'}`;
  }
  return fields;
}
