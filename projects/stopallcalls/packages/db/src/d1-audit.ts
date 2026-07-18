import type { D1Like } from './d1';
import type { AuditEventRecord, AuditStore } from './audit';

// Phase 6 (DATA-004): D1-backed append-only audit store. The repository layer
// exposes no UPDATE or DELETE; insertion order is the chain order (rowid).

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  entity: string;
  entity_id: string;
  correlation_id: string;
  detail_json: string | null;
  prev_event_hash: string | null;
  event_hash: string;
  occurred_at: string;
}

const toAudit = (row: AuditRow): AuditEventRecord => ({
  id: row.id,
  actorId: row.actor_id,
  actorType: row.actor_type as AuditEventRecord['actorType'],
  action: row.action,
  entity: row.entity,
  entityId: row.entity_id,
  correlationId: row.correlation_id,
  detail: row.detail_json ? JSON.parse(row.detail_json) : null,
  prevEventHash: row.prev_event_hash,
  eventHash: row.event_hash,
  occurredAt: row.occurred_at,
});

export class D1AuditStore implements AuditStore {
  constructor(private readonly db: D1Like) {}

  async append(record: AuditEventRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO audit_events (id, actor_id, actor_type, action, entity, entity_id,
           correlation_id, detail_json, prev_event_hash, event_hash, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.actorId,
        record.actorType,
        record.action,
        record.entity,
        record.entityId,
        record.correlationId,
        record.detail ? JSON.stringify(record.detail) : null,
        record.prevEventHash,
        record.eventHash,
        record.occurredAt,
      )
      .run();
  }

  async list(limit?: number): Promise<AuditEventRecord[]> {
    const sql = limit
      ? `SELECT * FROM (SELECT *, rowid AS rid FROM audit_events ORDER BY rid DESC LIMIT ?) ORDER BY rid`
      : 'SELECT * FROM audit_events ORDER BY rowid';
    const stmt = limit ? this.db.prepare(sql).bind(limit) : this.db.prepare(sql);
    const { results } = await stmt.all<AuditRow>();
    return results.map(toAudit);
  }

  async getLast(): Promise<AuditEventRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM audit_events ORDER BY rowid DESC LIMIT 1')
      .first<AuditRow>();
    return row ? toAudit(row) : null;
  }
}
