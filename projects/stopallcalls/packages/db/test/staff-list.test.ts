import { describe, expect, it } from 'vitest';
import { InMemoryIntakeStore } from '../src/index';
import type { IntakeRecord } from '../src/types';

function record(id: string, state: IntakeRecord['state'], updatedAt: string): IntakeRecord {
  return {
    id,
    consumerKey: `consumer-${id}@test`,
    jurisdiction: 'CA-ON',
    state,
    profile: null,
    agencies: [],
    submittedSnapshot: null,
    version: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt,
  };
}

describe('IntakeStore.listForStaff (UI-002 queue)', () => {
  it('returns newest activity first and honors the state filter', async () => {
    const store = new InMemoryIntakeStore();
    await store.insert(record('a', 'SUBMITTED', '2026-07-10T00:00:00.000Z'));
    await store.insert(record('b', 'CONFLICT_REVIEW', '2026-07-12T00:00:00.000Z'));
    await store.insert(record('c', 'SUBMITTED', '2026-07-11T00:00:00.000Z'));

    const all = await store.listForStaff();
    expect(all.map((r) => r.id)).toEqual(['b', 'c', 'a']);

    const submitted = await store.listForStaff({ state: 'SUBMITTED' });
    expect(submitted.map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('applies the limit and returns copies, not live records', async () => {
    const store = new InMemoryIntakeStore();
    await store.insert(record('a', 'DRAFT', '2026-07-10T00:00:00.000Z'));
    await store.insert(record('b', 'DRAFT', '2026-07-11T00:00:00.000Z'));

    const limited = await store.listForStaff({ limit: 1 });
    expect(limited).toHaveLength(1);
    limited[0]!.state = 'CANCELLED';
    const fresh = await store.getById(limited[0]!.id);
    expect(fresh!.state).toBe('DRAFT');
  });
});
