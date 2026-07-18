import type { AuthChallenge, AuthStore, ConsumerSession } from './auth';
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
