// Queue-consumer entry point (SRS §7 asynchronous processing). Phase 0 stub:
// defines the job envelope contract; real consumers (Clio sync, scanning, PDF,
// delivery) arrive with their phases.

export interface JobEnvelope<T = unknown> {
  type: string;
  // WF-003: every external side effect carries an idempotency key.
  idempotencyKey: string;
  // ARC-010: correlation ID spans request → queue → provider call.
  correlationId: string;
  payload: T;
}

export interface Env {
  // Bindings are declared in infra/wrangler.jobs.jsonc; none are provisioned
  // yet (Phase 0 defers Cloudflare resources).
  DB?: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
}

export default {
  async queue(batch: MessageBatch<JobEnvelope>, _env: Env): Promise<void> {
    for (const message of batch.messages) {
      // At-least-once delivery: consumers must be idempotent before doing real
      // work here. Phase 0 acknowledges without side effects.
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, JobEnvelope>;
