import { describe, expect, it } from 'vitest';
import { canCreateMatters, evaluateGates } from '../src/index';

describe('evaluateGates', () => {
  it('passes EVIDENCE only when every file is scanned clean', () => {
    expect(evaluateGates({ evidence: { total: 0, clean: 0 }, conflictDisposition: null }).EVIDENCE.status).toBe('PENDING');
    expect(evaluateGates({ evidence: { total: 2, clean: 1 }, conflictDisposition: null }).EVIDENCE.status).toBe('PENDING');
    expect(evaluateGates({ evidence: { total: 2, clean: 2 }, conflictDisposition: null }).EVIDENCE.status).toBe('PASSED');
  });

  it('maps the human conflict disposition onto the CONFLICT gate', () => {
    const at = (d: Parameters<typeof evaluateGates>[0]['conflictDisposition']) =>
      evaluateGates({ evidence: { total: 1, clean: 1 }, conflictDisposition: d }).CONFLICT.status;
    expect(at(null)).toBe('PENDING');
    expect(at('CLEAR')).toBe('PASSED');
    expect(at('POSSIBLE_CONFLICT')).toBe('MANUAL_REVIEW');
    expect(at('CONFLICT_FOUND')).toBe('FAILED');
  });

  it('keeps matter creation blocked until the Phase 4 gates report PASSED', () => {
    const base = { evidence: { total: 1, clean: 1 }, conflictDisposition: 'CLEAR' as const };
    expect(canCreateMatters(evaluateGates(base))).toBe(false);
    expect(
      canCreateMatters(
        evaluateGates({ ...base, identity: 'PASSED', retainer: 'PASSED', payment: 'PASSED' }),
      ),
    ).toBe(true);
  });
});
