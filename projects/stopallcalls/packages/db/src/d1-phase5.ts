import type { D1Like } from './d1';
import type { DeliveryRecord, DeliveryStore, TaskRecord, TaskStore } from './delivery';
import type {
  ApprovalRecord,
  ApprovalStore,
  LetterTemplateRecord,
  LetterTemplateStore,
  LetterVersionRecord,
  LetterVersionStore,
} from './letters';
import { ServiceError } from './service';

// Phase 5 D1-backed stores (migration 0004). Same conventions as the rest:
// snake_case rows, JSON columns for structured fields, rowid = insertion order.

interface TemplateRow {
  id: string;
  jurisdiction: string;
  version: number;
  content_hash: string;
  body: string;
  r2_key: string;
  published_at: string | null;
  created_at: string;
}

const toTemplate = (row: TemplateRow): LetterTemplateRecord => ({
  id: row.id,
  jurisdiction: row.jurisdiction,
  version: row.version,
  contentHash: row.content_hash,
  body: row.body,
  publishedAt: row.published_at ?? row.created_at,
  createdAt: row.created_at,
});

export class D1LetterTemplateStore implements LetterTemplateStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: LetterTemplateRecord): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO letter_templates (id, jurisdiction, version, content_hash, body, r2_key,
             published_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.jurisdiction,
          record.version,
          record.contentHash,
          record.body,
          `letter-templates/${record.jurisdiction}/v${record.version}.txt`,
          record.publishedAt,
          record.createdAt,
        )
        .run();
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new ServiceError(409, 'VERSION_EXISTS', 'This template version already exists.');
      }
      throw err;
    }
  }

  async getById(id: string): Promise<LetterTemplateRecord | null> {
    const row = await this.db.prepare('SELECT * FROM letter_templates WHERE id = ?').bind(id).first<TemplateRow>();
    return row ? toTemplate(row) : null;
  }

  async getActive(jurisdiction: string): Promise<LetterTemplateRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM letter_templates WHERE jurisdiction = ? ORDER BY version DESC LIMIT 1')
      .bind(jurisdiction)
      .first<TemplateRow>();
    return row ? toTemplate(row) : null;
  }
}

interface LetterVersionRow {
  id: string;
  matter_id: string;
  template_id: string;
  template_version: number;
  source_snapshot_json: string;
  generator_version: string;
  content_hash: string;
  pdf_sha256: string | null;
  status: string;
  author: string;
  created_at: string;
}

const toLetterVersion = (row: LetterVersionRow): LetterVersionRecord => ({
  id: row.id,
  matterId: row.matter_id,
  templateId: row.template_id,
  templateVersion: row.template_version,
  sourceSnapshot: JSON.parse(row.source_snapshot_json),
  generatorVersion: row.generator_version,
  contentHash: row.content_hash,
  pdfSha256: row.pdf_sha256,
  status: row.status as LetterVersionRecord['status'],
  author: row.author,
  createdAt: row.created_at,
});

export class D1LetterVersionStore implements LetterVersionStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: LetterVersionRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO letter_versions (id, matter_id, template_id, template_version,
           source_snapshot_json, generator_version, content_hash, pdf_sha256, status, author, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.matterId,
        record.templateId,
        record.templateVersion,
        JSON.stringify(record.sourceSnapshot),
        record.generatorVersion,
        record.contentHash,
        record.pdfSha256,
        record.status,
        record.author,
        record.createdAt,
      )
      .run();
  }

  async getById(id: string): Promise<LetterVersionRecord | null> {
    const row = await this.db.prepare('SELECT * FROM letter_versions WHERE id = ?').bind(id).first<LetterVersionRow>();
    return row ? toLetterVersion(row) : null;
  }

  async listByMatter(matterId: string): Promise<LetterVersionRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM letter_versions WHERE matter_id = ? ORDER BY rowid')
      .bind(matterId)
      .all<LetterVersionRow>();
    return results.map(toLetterVersion);
  }

  async update(record: LetterVersionRecord): Promise<void> {
    await this.db
      .prepare('UPDATE letter_versions SET status = ? WHERE id = ?')
      .bind(record.status, record.id)
      .run();
  }
}

interface ApprovalRow {
  id: string;
  letter_version_id: string;
  approver_id: string;
  letter_content_hash: string;
  decision: string;
  reason: string | null;
  decided_at: string;
}

const toApproval = (row: ApprovalRow): ApprovalRecord => ({
  id: row.id,
  letterVersionId: row.letter_version_id,
  approverId: row.approver_id,
  letterContentHash: row.letter_content_hash,
  decision: row.decision as ApprovalRecord['decision'],
  reason: row.reason,
  decidedAt: row.decided_at,
});

export class D1ApprovalStore implements ApprovalStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: ApprovalRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO approvals (id, letter_version_id, approver_id, letter_content_hash,
           decision, reason, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.letterVersionId,
        record.approverId,
        record.letterContentHash,
        record.decision,
        record.reason,
        record.decidedAt,
      )
      .run();
  }

  async listByLetterVersion(letterVersionId: string): Promise<ApprovalRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM approvals WHERE letter_version_id = ? ORDER BY rowid')
      .bind(letterVersionId)
      .all<ApprovalRow>();
    return results.map(toApproval);
  }
}

interface DeliveryRow {
  id: string;
  matter_id: string;
  letter_version_id: string;
  channel: string;
  idempotency_key: string;
  provider_message_id: string | null;
  recipient: string;
  artifact_hash: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const toDelivery = (row: DeliveryRow): DeliveryRecord => ({
  id: row.id,
  matterId: row.matter_id,
  letterVersionId: row.letter_version_id,
  channel: row.channel as DeliveryRecord['channel'],
  idempotencyKey: row.idempotency_key,
  providerMessageId: row.provider_message_id,
  recipient: row.recipient,
  artifactHash: row.artifact_hash,
  status: row.status as DeliveryRecord['status'],
  attempts: row.attempts,
  lastError: row.last_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1DeliveryStore implements DeliveryStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: DeliveryRecord): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO deliveries (id, matter_id, letter_version_id, channel, idempotency_key,
             provider_message_id, recipient, artifact_hash, status, attempts, last_error,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.matterId,
          record.letterVersionId,
          record.channel,
          record.idempotencyKey,
          record.providerMessageId,
          record.recipient,
          record.artifactHash,
          record.status,
          record.attempts,
          record.lastError,
          record.createdAt,
          record.updatedAt,
        )
        .run();
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new ServiceError(409, 'DUPLICATE_DELIVERY', 'A delivery already exists for this letter.');
      }
      throw err;
    }
  }

  async getByIdempotencyKey(key: string): Promise<DeliveryRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM deliveries WHERE idempotency_key = ?')
      .bind(key)
      .first<DeliveryRow>();
    return row ? toDelivery(row) : null;
  }

  async getByProviderMessageId(messageId: string): Promise<DeliveryRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM deliveries WHERE provider_message_id = ?')
      .bind(messageId)
      .first<DeliveryRow>();
    return row ? toDelivery(row) : null;
  }

  async listByMatter(matterId: string): Promise<DeliveryRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM deliveries WHERE matter_id = ? ORDER BY rowid')
      .bind(matterId)
      .all<DeliveryRow>();
    return results.map(toDelivery);
  }

  async listByStatus(statuses: DeliveryRecord['status'][]): Promise<DeliveryRecord[]> {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => '?').join(',');
    const { results } = await this.db
      .prepare(`SELECT * FROM deliveries WHERE status IN (${placeholders}) ORDER BY rowid`)
      .bind(...statuses)
      .all<DeliveryRow>();
    return results.map(toDelivery);
  }

  async update(record: DeliveryRecord): Promise<void> {
    await this.db
      .prepare(
        `UPDATE deliveries SET provider_message_id = ?, status = ?, attempts = ?, last_error = ?,
           updated_at = ? WHERE id = ?`,
      )
      .bind(record.providerMessageId, record.status, record.attempts, record.lastError, record.updatedAt, record.id)
      .run();
  }
}

interface TaskRow {
  id: string;
  matter_id: string | null;
  intake_id: string | null;
  kind: string;
  status: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

const toTask = (row: TaskRow): TaskRecord => ({
  id: row.id,
  matterId: row.matter_id,
  intakeId: row.intake_id,
  kind: row.kind,
  status: row.status as TaskRecord['status'],
  dueAt: row.due_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1TaskStore implements TaskStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: TaskRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO tasks (id, matter_id, intake_id, kind, status, due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.matterId,
        record.intakeId,
        record.kind,
        record.status,
        record.dueAt,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async listByMatter(matterId: string): Promise<TaskRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM tasks WHERE matter_id = ? ORDER BY rowid')
      .bind(matterId)
      .all<TaskRow>();
    return results.map(toTask);
  }
}
