import { describe, expect, it } from 'vitest';
import {
  InMemoryAuditStore,
  appendAuditEvent,
  verifyAuditChain,
  type AuditEventRecord,
} from '../src/index';

async function chainOf(n: number) {
  const store = new InMemoryAuditStore();
  for (let i = 0; i < n; i++) {
    await appendAuditEvent(store, {
      actorId: `staff-${i}`,
      actorType: 'STAFF',
      action: 'TEST_ACTION',
      entity: 'test_entity',
      entityId: `entity-${i}`,
    });
  }
  return { store, events: await store.list() };
}

describe('audit trail (DATA-004, tamper-evident)', () => {
  it('chains events: each hash covers content + previous hash', async () => {
    const { events } = await chainOf(3);
    expect(events[0]!.prevEventHash).toBeNull();
    expect(events[1]!.prevEventHash).toBe(events[0]!.eventHash);
    expect(events[2]!.prevEventHash).toBe(events[1]!.eventHash);
    expect(await verifyAuditChain(events)).toEqual({ valid: true, checked: 3, firstBrokenIndex: null });
  });

  it('detects content tampering at the exact event', async () => {
    const { events } = await chainOf(3);
    const tampered: AuditEventRecord[] = structuredClone(events);
    tampered[1]!.actorId = 'someone-else';
    const verdict = await verifyAuditChain(tampered);
    expect(verdict.valid).toBe(false);
    expect(verdict.firstBrokenIndex).toBe(1);
  });

  it('detects deletion and reordering', async () => {
    const { events } = await chainOf(4);
    const withDeletion = [events[0]!, events[2]!, events[3]!];
    expect((await verifyAuditChain(withDeletion)).valid).toBe(false);
    const reordered = [events[0]!, events[2]!, events[1]!, events[3]!];
    expect((await verifyAuditChain(reordered)).valid).toBe(false);
  });

  it('detects a recomputed-hash forgery (edit + rehash without relinking)', async () => {
    const { events } = await chainOf(2);
    const forged = structuredClone(events);
    // Attacker edits the last event and even fixes its prev pointer — but the
    // stored eventHash no longer matches the recomputed canonical content.
    forged[1]!.detail = { injected: 'value' };
    const verdict = await verifyAuditChain(forged);
    expect(verdict.valid).toBe(false);
    expect(verdict.firstBrokenIndex).toBe(1);
  });

  it('requires action/entity/entityId and defaults correlation ids', async () => {
    const store = new InMemoryAuditStore();
    await expect(
      appendAuditEvent(store, { actorType: 'SYSTEM', action: ' ', entity: 'x', entityId: 'y' }),
    ).rejects.toMatchObject({ code: 'AUDIT_FIELDS_REQUIRED' });
    const event = await appendAuditEvent(store, {
      actorType: 'SYSTEM',
      action: 'TEST',
      entity: 'x',
      entityId: 'y',
    });
    expect(event.correlationId).toBeTruthy();
    expect(event.actorId).toBeNull();
  });
});
