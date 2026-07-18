import { jobMessageSchema, type JobMessage } from '@stopallcalls/contracts';
import {
  D1DeliveryStore,
  D1MatterStore,
  D1TaskStore,
  runFollowUpSweep,
} from '@stopallcalls/db';

// Queue consumer + cron for asynchronous processing (SRS §7). At-least-once
// delivery: every handler is idempotent, so retries and replays are safe.
// Messages that fail validation are acked immediately (retrying malformed
// input can never succeed); handler errors retry() up to the configured max
// before landing in the DLQ.

export interface Env {
  DB: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
}

async function handle(message: JobMessage, env: Env): Promise<void> {
  switch (message.type) {
    case 'FOLLOW_UP_SWEEP': {
      await runFollowUpSweep({
        deliveries: new D1DeliveryStore(env.DB),
        matters: new D1MatterStore(env.DB),
        tasks: new D1TaskStore(env.DB),
      });
      return;
    }
    // Enqueued once evidence scanning / conflict checks move off the request
    // path (TODO.md); validated shapes exist so producers can start early.
    case 'EVIDENCE_SCAN':
    case 'CONFLICT_CHECK':
      console.warn(`job type ${message.type} not yet handled`);
      return;
  }
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const parsed = jobMessageSchema.safeParse(message.body);
      if (!parsed.success) {
        // Malformed forever — never retry; ack so the DLQ isn't flooded.
        console.error('dropping malformed job message');
        message.ack();
        continue;
      }
      try {
        await handle(parsed.data, env);
        message.ack();
      } catch (err) {
        console.error(`job ${parsed.data.type} failed: ${err instanceof Error ? err.message : 'unknown'}`);
        message.retry();
      }
    }
  },

  // OPS-007 / DLV-007: the follow-up sweep runs daily; idempotent per pass.
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const result = await runFollowUpSweep({
      deliveries: new D1DeliveryStore(env.DB),
      matters: new D1MatterStore(env.DB),
      tasks: new D1TaskStore(env.DB),
    });
    // warn-level so it survives the no-console lint policy and stays visible
    // in Workers observability (OPS-004 queue-lag signal).
    console.warn(`follow-up sweep: scanned=${result.scanned} opened=${result.opened}`);
  },
} satisfies ExportedHandler<Env>;
