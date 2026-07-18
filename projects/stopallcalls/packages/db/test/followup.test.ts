import { describe, expect, it } from 'vitest';
import {
  FOLLOW_UP_TASK_KIND,
  InMemoryDeliveryStore,
  InMemoryMatterStore,
  InMemoryTaskStore,
  runFollowUpSweep,
  type DeliveryRecord,
  type MatterRecord,
} from '../src/index';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-18T12:00:00.000Z');

async function seed(deliveredAgoDays: number, matterState: MatterRecord['state'] = 'DELIVERED') {
  const deliveries = new InMemoryDeliveryStore();
  const matters = new InMemoryMatterStore();
  const tasks = new InMemoryTaskStore();
  const matter: MatterRecord = {
    id: crypto.randomUUID(),
    intakeId: crypto.randomUUID(),
    agencyId: crypto.randomUUID(),
    clioMatterId: 'clio-1',
    displayNumber: 'FAKE-1',
    state: matterState,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  await matters.insert(matter);
  const stamp = new Date(NOW.getTime() - deliveredAgoDays * DAY).toISOString();
  const delivery: DeliveryRecord = {
    id: crypto.randomUUID(),
    matterId: matter.id,
    letterVersionId: crypto.randomUUID(),
    channel: 'EMAIL',
    idempotencyKey: `send:${matter.id}`,
    providerMessageId: 'msg-1',
    recipient: 'agency@example.test',
    artifactHash: 'a'.repeat(64),
    status: 'DELIVERED',
    attempts: 1,
    lastError: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await deliveries.insert(delivery);
  return { deliveries, matters, tasks, matter };
}

describe('runFollowUpSweep (DLV-007/OPS-007)', () => {
  it('opens a follow-up task and advances the matter once the wait elapses', async () => {
    const deps = await seed(15);
    const result = await runFollowUpSweep(deps, { now: NOW, waitDays: 14 });
    expect(result).toEqual({ scanned: 1, opened: 1 });
    expect((await deps.matters.getById(deps.matter.id))?.state).toBe('FOLLOW_UP_DUE');
    const tasks = await deps.tasks.listByMatter(deps.matter.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.kind).toBe(FOLLOW_UP_TASK_KIND);
  });

  it('leaves recent deliveries untouched', async () => {
    const deps = await seed(3);
    const result = await runFollowUpSweep(deps, { now: NOW, waitDays: 14 });
    expect(result.opened).toBe(0);
    expect((await deps.matters.getById(deps.matter.id))?.state).toBe('DELIVERED');
  });

  it('is idempotent — repeated sweeps never duplicate tasks', async () => {
    const deps = await seed(20);
    await runFollowUpSweep(deps, { now: NOW, waitDays: 14 });
    const second = await runFollowUpSweep(deps, { now: NOW, waitDays: 14 });
    expect(second.opened).toBe(0);
    expect(await deps.tasks.listByMatter(deps.matter.id)).toHaveLength(1);
  });

  it('skips matters no longer in DELIVERED (already progressed or closed)', async () => {
    const deps = await seed(20, 'CLOSED');
    const result = await runFollowUpSweep(deps, { now: NOW, waitDays: 14 });
    expect(result.opened).toBe(0);
    expect(await deps.tasks.listByMatter(deps.matter.id)).toHaveLength(0);
  });
});
