import { canTransition } from '@stopallcalls/domain';
import type { MatterStore } from './clio';
import type { DeliveryStore, TaskStore } from './delivery';

// Phase 6 (DLV-007 / OPS-007): scheduled follow-up sweep. Runs from the jobs
// worker cron; every pass is idempotent, so overlapping or replayed runs
// never duplicate tasks. A follow-up is due when a DELIVERED letter has had
// no recorded response for `waitDays`.

export const FOLLOW_UP_TASK_KIND = 'RESPONSE_FOLLOW_UP';
export const DEFAULT_FOLLOW_UP_DAYS = 14;

export interface FollowUpDeps {
  deliveries: DeliveryStore;
  matters: MatterStore;
  tasks: TaskStore;
}

export interface FollowUpSweepResult {
  scanned: number;
  opened: number;
}

export async function runFollowUpSweep(
  deps: FollowUpDeps,
  options: { now?: Date; waitDays?: number } = {},
): Promise<FollowUpSweepResult> {
  const now = options.now ?? new Date();
  const waitDays = options.waitDays ?? DEFAULT_FOLLOW_UP_DAYS;
  const cutoff = new Date(now.getTime() - waitDays * 24 * 60 * 60 * 1000).toISOString();

  const delivered = await deps.deliveries.listByStatus(['DELIVERED']);
  let opened = 0;
  for (const delivery of delivered) {
    if (delivery.updatedAt > cutoff) continue;
    const matter = await deps.matters.getById(delivery.matterId);
    // Only DELIVERED matters progress; anything else was already handled.
    if (!matter || matter.state !== 'DELIVERED') continue;
    const existing = await deps.tasks.listByMatter(matter.id);
    if (existing.some((t) => t.kind === FOLLOW_UP_TASK_KIND)) continue;
    if (!canTransition(matter.state, 'FOLLOW_UP_DUE')) continue;

    matter.state = 'FOLLOW_UP_DUE';
    matter.updatedAt = now.toISOString();
    await deps.matters.update(matter);
    await deps.tasks.insert({
      id: crypto.randomUUID(),
      matterId: matter.id,
      intakeId: matter.intakeId,
      kind: FOLLOW_UP_TASK_KIND,
      status: 'OPEN',
      dueAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    opened += 1;
  }
  return { scanned: delivered.length, opened };
}
