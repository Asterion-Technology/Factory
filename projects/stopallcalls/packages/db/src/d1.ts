import type { AuthChallenge, AuthStore, ConsumerSession } from './auth';
import type {
  ClioMappingStore,
  ConflictCheckRecord,
  ConflictCheckStore,
  MatterRecord,
  MatterStore,
} from './clio';
import type { EvidenceRecord, EvidenceStore } from './evidence';
import type { IntakeRecord, IntakeStore } from './types';

// D1-backed stores (replace the in-memory ones at deploy). Typed against a
// structural subset of the D1 binding so this package needs no runtime
// dependency; the real D1Database satisfies D1Like as-is.

export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike;
}

interface IntakeRow {
  id: string;
  consumer_key: string;
  jurisdiction: string;
  state: string;
  profile_json: string | null;
  agencies_json: string;
  submitted_snapshot_json: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const toIntake = (row: IntakeRow): IntakeRecord => ({
  id: row.id,
  consumerKey: row.consumer_key,
  jurisdiction: row.jurisdiction,
  state: row.state as IntakeRecord['state'],
  profile: row.profile_json ? JSON.parse(row.profile_json) : null,
  agencies: JSON.parse(row.agencies_json),
  submittedSnapshot: row.submitted_snapshot_json ? JSON.parse(row.submitted_snapshot_json) : null,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1IntakeStore implements IntakeStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: IntakeRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO intakes (id, consumer_key, jurisdiction, state, profile_json, agencies_json,
           submitted_snapshot_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.consumerKey,
        record.jurisdiction,
        record.state,
        record.profile ? JSON.stringify(record.profile) : null,
        JSON.stringify(record.agencies),
        record.submittedSnapshot ? JSON.stringify(record.submittedSnapshot) : null,
        record.version,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getById(id: string): Promise<IntakeRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM intakes WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<IntakeRow>();
    return row ? toIntake(row) : null;
  }

  async findActiveByConsumer(consumerKey: string): Promise<IntakeRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM intakes
         WHERE consumer_key = ? AND state NOT IN ('CLOSED', 'CANCELLED') AND deleted_at IS NULL
         ORDER BY created_at LIMIT 1`,
      )
      .bind(consumerKey)
      .first<IntakeRow>();
    return row ? toIntake(row) : null;
  }

  async update(record: IntakeRecord, expectedVersion: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE intakes SET state = ?, profile_json = ?, agencies_json = ?,
           submitted_snapshot_json = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .bind(
        record.state,
        record.profile ? JSON.stringify(record.profile) : null,
        JSON.stringify(record.agencies),
        record.submittedSnapshot ? JSON.stringify(record.submittedSnapshot) : null,
        record.updatedAt,
        record.id,
        expectedVersion,
      )
      .run();
    return result.meta.changes === 1;
  }
}

interface ChallengeRow {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
}

interface SessionRow {
  token: string;
  email: string;
  created_at: string;
  expires_at: string;
}

export class D1AuthStore implements AuthStore {
  constructor(private readonly db: D1Like) {}

  async insertChallenge(challenge: AuthChallenge): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO auth_challenges (id, email, code_hash, expires_at, attempts, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        challenge.id,
        challenge.email,
        challenge.codeHash,
        challenge.expiresAt,
        challenge.attempts,
        challenge.consumedAt,
        challenge.createdAt,
      )
      .run();
  }

  async getLatestChallenge(email: string): Promise<AuthChallenge | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM auth_challenges WHERE email = ? AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(email)
      .first<ChallengeRow>();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      attempts: row.attempts,
      consumedAt: row.consumed_at,
      createdAt: row.created_at,
    };
  }

  async updateChallenge(challenge: AuthChallenge): Promise<void> {
    await this.db
      .prepare('UPDATE auth_challenges SET attempts = ?, consumed_at = ? WHERE id = ?')
      .bind(challenge.attempts, challenge.consumedAt, challenge.id)
      .run();
  }

  async insertSession(session: ConsumerSession): Promise<void> {
    await this.db
      .prepare('INSERT INTO consumer_sessions (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(session.token, session.email, session.createdAt, session.expiresAt)
      .run();
  }

  async getSession(token: string): Promise<ConsumerSession | null> {
    const row = await this.db
      .prepare('SELECT * FROM consumer_sessions WHERE token = ?')
      .bind(token)
      .first<SessionRow>();
    if (!row) return null;
    return { token: row.token, email: row.email, createdAt: row.created_at, expiresAt: row.expires_at };
  }
}

interface EvidenceRow {
  id: string;
  intake_id: string;
  storage_key: string;
  category: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  scan_status: string;
  custody_json: string;
  created_at: string;
  updated_at: string;
}

const toEvidence = (row: EvidenceRow): EvidenceRecord => ({
  id: row.id,
  intakeId: row.intake_id,
  storageKey: row.storage_key,
  category: row.category as EvidenceRecord['category'],
  originalFilename: row.original_filename,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  scanStatus: row.scan_status as EvidenceRecord['scanStatus'],
  custody: JSON.parse(row.custody_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1EvidenceStore implements EvidenceStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: EvidenceRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO evidence_files (id, intake_id, storage_key, category, original_filename,
           mime_type, size_bytes, sha256, scan_status, custody_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.intakeId,
        record.storageKey,
        record.category,
        record.originalFilename,
        record.mimeType,
        record.sizeBytes,
        record.sha256,
        record.scanStatus,
        JSON.stringify(record.custody),
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getById(id: string): Promise<EvidenceRecord | null> {
    const row = await this.db.prepare('SELECT * FROM evidence_files WHERE id = ?').bind(id).first<EvidenceRow>();
    return row ? toEvidence(row) : null;
  }

  async findByStorageKey(storageKey: string): Promise<EvidenceRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM evidence_files WHERE storage_key = ?')
      .bind(storageKey)
      .first<EvidenceRow>();
    return row ? toEvidence(row) : null;
  }

  async listByIntake(intakeId: string): Promise<EvidenceRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM evidence_files WHERE intake_id = ? ORDER BY created_at')
      .bind(intakeId)
      .all<EvidenceRow>();
    return results.map(toEvidence);
  }

  async update(record: EvidenceRecord): Promise<void> {
    await this.db
      .prepare(
        `UPDATE evidence_files SET sha256 = ?, scan_status = ?, custody_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(record.sha256, record.scanStatus, JSON.stringify(record.custody), record.updatedAt, record.id)
      .run();
  }
}

interface ConflictCheckRow {
  id: string;
  intake_id: string;
  search_package_json: string;
  clio_query_refs_json: string | null;
  disposition: string | null;
  reviewed_by: string | null;
  rationale: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const toConflictCheck = (row: ConflictCheckRow): ConflictCheckRecord => ({
  id: row.id,
  intakeId: row.intake_id,
  terms: JSON.parse(row.search_package_json),
  hits: row.clio_query_refs_json ? JSON.parse(row.clio_query_refs_json) : [],
  disposition: row.disposition as ConflictCheckRecord['disposition'],
  reviewedBy: row.reviewed_by,
  rationale: row.rationale,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
});

export class D1ConflictCheckStore implements ConflictCheckStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: ConflictCheckRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO conflict_checks (id, intake_id, search_package_json, clio_query_refs_json,
           disposition, reviewed_by, rationale, reviewed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.intakeId,
        JSON.stringify(record.terms),
        JSON.stringify(record.hits),
        record.disposition,
        record.reviewedBy,
        record.rationale,
        record.reviewedAt,
        record.createdAt,
      )
      .run();
  }

  async getById(id: string): Promise<ConflictCheckRecord | null> {
    const row = await this.db.prepare('SELECT * FROM conflict_checks WHERE id = ?').bind(id).first<ConflictCheckRow>();
    return row ? toConflictCheck(row) : null;
  }

  async getByIntake(intakeId: string): Promise<ConflictCheckRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM conflict_checks WHERE intake_id = ? ORDER BY created_at LIMIT 1')
      .bind(intakeId)
      .first<ConflictCheckRow>();
    return row ? toConflictCheck(row) : null;
  }

  async update(record: ConflictCheckRecord): Promise<void> {
    await this.db
      .prepare('UPDATE conflict_checks SET disposition = ?, reviewed_by = ?, rationale = ?, reviewed_at = ? WHERE id = ?')
      .bind(record.disposition, record.reviewedBy, record.rationale, record.reviewedAt, record.id)
      .run();
  }
}

interface MatterRow {
  id: string;
  intake_id: string;
  agency_id: string;
  clio_matter_id: string | null;
  display_number: string | null;
  state: string;
  created_at: string;
  updated_at: string;
}

const toMatter = (row: MatterRow): MatterRecord => ({
  id: row.id,
  intakeId: row.intake_id,
  agencyId: row.agency_id,
  clioMatterId: row.clio_matter_id ?? '',
  displayNumber: row.display_number ?? '',
  state: row.state as MatterRecord['state'],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1MatterStore implements MatterStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: MatterRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO matters (id, intake_id, agency_id, clio_matter_id, display_number, state,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.intakeId,
        record.agencyId,
        record.clioMatterId,
        record.displayNumber,
        record.state,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async listByIntake(intakeId: string): Promise<MatterRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM matters WHERE intake_id = ? ORDER BY created_at')
      .bind(intakeId)
      .all<MatterRow>();
    return results.map(toMatter);
  }
}

interface MappingRow {
  clio_id: string;
  display_number: string | null;
}

export class D1ClioMappingStore implements ClioMappingStore {
  constructor(private readonly db: D1Like) {}

  async get(idempotencyKey: string): Promise<{ clioId: string; displayNumber?: string } | null> {
    const row = await this.db
      .prepare('SELECT clio_id, display_number FROM clio_mappings WHERE idempotency_key = ?')
      .bind(idempotencyKey)
      .first<MappingRow>();
    if (!row) return null;
    return { clioId: row.clio_id, ...(row.display_number ? { displayNumber: row.display_number } : {}) };
  }

  async insert(entry: {
    idempotencyKey: string;
    localEntity: string;
    localId: string;
    clioId: string;
    displayNumber?: string;
  }): Promise<void> {
    const at = new Date().toISOString();
    // Ledger semantics (DATA-005/CLIO-008): the first write for a key wins;
    // a concurrent retry hitting the UNIQUE constraints is a no-op, never an error.
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO clio_mappings (id, local_entity, local_id, clio_resource, clio_id,
           idempotency_key, display_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        entry.localEntity,
        entry.localId,
        entry.localEntity === 'matter' ? 'matter' : 'contact',
        entry.clioId,
        entry.idempotencyKey,
        entry.displayNumber ?? null,
        at,
        at,
      )
      .run();
  }
}
