import { describe, expect, it } from 'vitest';
import { AGENCY_CSV_HEADER, buildSeedSql, parseCsv, parseSeedCsv } from '../scripts/agency-seed-lib';

const HEADER = AGENCY_CSV_HEADER.join(',');

const row = (over: Partial<Record<(typeof AGENCY_CSV_HEADER)[number], string>>): string =>
  AGENCY_CSV_HEADER.map((c) => {
    const v =
      over[c] ??
      ({
        country: 'CA',
        region: 'ON',
        name: 'Fictitious Recovery Ltd',
        source_registry: 'Test Registry',
        source_url: 'https://registry.example.test',
        verified_at: '2026-07-19T00:00:00.000Z',
      }[c as string] ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');

describe('agency seed pipeline (RAD-19/RAD-23)', () => {
  it('parseCsv handles quotes, embedded commas, doubled quotes, and CRLF', () => {
    const parsed = parseCsv('a,"b,1","say ""hi""",d\r\ne,f,g,h\n');
    expect(parsed).toEqual([
      ['a', 'b,1', 'say "hi"', 'd'],
      ['e', 'f', 'g', 'h'],
    ]);
  });

  it('derives normalized columns and deterministic ids', () => {
    const csv = `${HEADER}\n${row({ name: "D'Amico & Associés Ltée", licence_number: 'ON-42', aliases: 'Alias One|Alias Two' })}`;
    const [rec] = parseSeedCsv('t.csv', csv);
    expect(rec!.id).toBe('aa:CA:ON:on-42');
    expect(rec!.nameNorm).toBe('d amico associes ltee');
    expect(rec!.canonicalKey).toBe('d amico associes ltee');
    expect(rec!.aliases).toEqual(['Alias One', 'Alias Two']);
    expect(rec!.aliasesNorm).toBe('alias one alias two');
    expect(rec!.licenceStatus).toBe('unknown');
  });

  it('rejects bad rows with file:line context', () => {
    expect(() => parseSeedCsv('t.csv', `${HEADER}\n${row({ country: 'FR' })}`)).toThrow('t.csv:2');
    expect(() => parseSeedCsv('t.csv', `${HEADER}\n${row({ verified_at: 'yesterday' })}`)).toThrow(/verified_at/);
    expect(() => parseSeedCsv('t.csv', `${HEADER}\n${row({ source_url: 'not-a-url' })}`)).toThrow(/provenance/);
    expect(() => parseSeedCsv('t.csv', 'wrong,header\n')).toThrow(/header mismatch/);
  });

  it('escapes apostrophes in SQL and preserves created_at on upsert', () => {
    const recs = parseSeedCsv('t.csv', `${HEADER}\n${row({ name: "O'Leary & Sons Ltd", licence_number: 'ON-7' })}`);
    const sql = buildSeedSql(recs, ['t.csv']);
    expect(sql).toContain("'O''Leary & Sons Ltd'");
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET');
    expect(sql).not.toContain('created_at = excluded.created_at');
    expect(sql).toContain('updated_at = excluded.updated_at');
  });

  it('fails loudly on id collisions instead of silently overwriting', () => {
    const csv = `${HEADER}\n${row({ licence_number: 'ON-9', name: 'First Agency Ltd' })}\n${row({ licence_number: 'ON-9', name: 'Second Agency Ltd' })}`;
    expect(() => buildSeedSql(parseSeedCsv('t.csv', csv), ['t.csv'])).toThrow(/duplicate id/);
  });

  it('the checked-in Ontario CSV parses clean end-to-end', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const csv = readFileSync(join(dir, '..', 'seed-data', 'agencies', 'ca-on.csv'), 'utf8');
    const recs = parseSeedCsv('ca-on.csv', csv);
    expect(recs.length).toBeGreaterThanOrEqual(129);
    expect(recs.every((r) => r.country === 'CA' && r.region === 'ON')).toBe(true);
    expect(recs.every((r) => r.sourceUrl.startsWith('https://'))).toBe(true);
    // Generation must stay collision-free as refreshes land.
    expect(() => buildSeedSql(recs, ['ca-on.csv'])).not.toThrow();
  });
});
