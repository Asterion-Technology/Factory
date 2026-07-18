import { ServiceError } from './service';

// Phase 6 (DATA-004 / ARC-010): append-only, tamper-evident audit trail.
// Every event's hash covers its content AND the previous event's hash, so any
// mutation, deletion, or reordering breaks the chain from that point on.
// The store interface has no update or delete — append-only by construction.
// Detail payloads must already be PII-free; identifiers only (SEC rules).

export type AuditActorType = 'STAFF' | 'CONSUMER' | 'SYSTEM';

export interface AuditEventRecord {
  id: string;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  entity: string;
  entityId: string;
  correlationId: string;
  detail: Record<string, string> | null;
  prevEventHash: string | null;
  eventHash: string;
  occurredAt: string;
}

export interface AuditStore {
  append(record: AuditEventRecord): Promise<void>;
  /** Newest last — the natural order for chain verification. */
  list(limit?: number): Promise<AuditEventRecord[]>;
  getLast(): Promise<AuditEventRecord | null>;
}

export class InMemoryAuditStore implements AuditStore {
  private events: AuditEventRecord[] = [];

  async append(record: AuditEventRecord): Promise<void> {
    this.events.push(structuredClone(record));
  }

  async list(limit?: number): Promise<AuditEventRecord[]> {
    const all = this.events.map((e) => structuredClone(e));
    return limit ? all.slice(-limit) : all;
  }

  async getLast(): Promise<AuditEventRecord | null> {
    const last = this.events.at(-1);
    return last ? structuredClone(last) : null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Canonical, key-ordered serialization — hashing must be deterministic. */
function canonicalize(record: Omit<AuditEventRecord, 'eventHash'>): string {
  return JSON.stringify([
    record.id,
    record.actorId,
    record.actorType,
    record.action,
    record.entity,
    record.entityId,
    record.correlationId,
    record.detail ? JSON.stringify(record.detail, Object.keys(record.detail).sort()) : null,
    record.prevEventHash,
    record.occurredAt,
  ]);
}

export interface AppendAuditInput {
  actorId?: string;
  actorType: AuditActorType;
  action: string;
  entity: string;
  entityId: string;
  correlationId?: string;
  detail?: Record<string, string>;
}

/** Appends one chained event. Callers never supply hashes or timestamps. */
export async function appendAuditEvent(store: AuditStore, input: AppendAuditInput): Promise<AuditEventRecord> {
  if (!input.action.trim() || !input.entity.trim() || !input.entityId.trim()) {
    throw new ServiceError(422, 'AUDIT_FIELDS_REQUIRED', 'action, entity, and entityId are required.');
  }
  const prev = await store.getLast();
  const unhashed: Omit<AuditEventRecord, 'eventHash'> = {
    id: crypto.randomUUID(),
    actorId: input.actorId?.trim() || null,
    actorType: input.actorType,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    correlationId: input.correlationId ?? crypto.randomUUID(),
    detail: input.detail ?? null,
    prevEventHash: prev?.eventHash ?? null,
    occurredAt: new Date().toISOString(),
  };
  const record: AuditEventRecord = { ...unhashed, eventHash: await sha256Hex(canonicalize(unhashed)) };
  await store.append(record);
  return record;
}

export interface AuditChainVerdict {
  valid: boolean;
  checked: number;
  /** Index (0-based, in list order) of the first broken event, if any. */
  firstBrokenIndex: number | null;
}

/** Recomputes every hash and link. Any edit/removal/reorder breaks from there. */
export async function verifyAuditChain(events: AuditEventRecord[]): Promise<AuditChainVerdict> {
  let prevHash: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    const { eventHash, ...unhashed } = event;
    const recomputed = await sha256Hex(canonicalize(unhashed));
    if (event.prevEventHash !== prevHash || eventHash !== recomputed) {
      return { valid: false, checked: events.length, firstBrokenIndex: i };
    }
    prevHash = eventHash;
  }
  return { valid: true, checked: events.length, firstBrokenIndex: null };
}
