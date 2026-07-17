import {
  EVIDENCE_ALLOWED_TYPES,
  MAX_EVIDENCE_FILES_PER_INTAKE,
  evidenceUploadRequestSchema,
  type EvidenceCategory,
  type EvidenceUploadRequest,
} from '@stopallcalls/contracts';
import { ServiceError } from './service';
import type { IntakeStore } from './types';

// Phase 2 (RAD-11): evidence pipeline. Files are quarantined on arrival and
// unavailable until scanned clean (EVD-005); every transition appends a
// chain-of-custody event (EVD-007).

export type EvidenceScanStatus = 'PENDING_UPLOAD' | 'QUARANTINED' | 'CLEAN' | 'INFECTED' | 'REJECTED' | 'REMOVED';

export interface CustodyEvent {
  at: string;
  action: string;
  detail?: string;
}

export interface EvidenceRecord {
  id: string;
  intakeId: string;
  // EVD-006: random, non-guessable storage key; never sent to clients.
  storageKey: string;
  category: EvidenceCategory;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  scanStatus: EvidenceScanStatus;
  custody: CustodyEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceStore {
  insert(record: EvidenceRecord): Promise<void>;
  getById(id: string): Promise<EvidenceRecord | null>;
  /** Lets the upload endpoint authorize a PUT against its reserved key. */
  findByStorageKey(storageKey: string): Promise<EvidenceRecord | null>;
  listByIntake(intakeId: string): Promise<EvidenceRecord[]>;
  update(record: EvidenceRecord): Promise<void>;
}

export class InMemoryEvidenceStore implements EvidenceStore {
  private byId = new Map<string, EvidenceRecord>();

  async insert(record: EvidenceRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<EvidenceRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async findByStorageKey(storageKey: string): Promise<EvidenceRecord | null> {
    for (const record of this.byId.values()) {
      if (record.storageKey === storageKey) return structuredClone(record);
    }
    return null;
  }

  async listByIntake(intakeId: string): Promise<EvidenceRecord[]> {
    return [...this.byId.values()]
      .filter((r) => r.intakeId === intakeId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => structuredClone(r));
  }

  async update(record: EvidenceRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

const now = (): string => new Date().toISOString();

const custody = (record: EvidenceRecord, action: string, detail?: string): void => {
  record.custody.push({ at: now(), action, ...(detail ? { detail } : {}) });
  record.updatedAt = now();
};

// EVD-004: the declared MIME must match the file's magic bytes. Text has no
// signature, so it is accepted only when the sample decodes without NULs.
function sniffMatches(mimeType: string, bytes: Uint8Array): boolean {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  const ascii = (s: string, offset = 0) => startsWith([...s].map((c) => c.charCodeAt(0)), offset);
  switch (mimeType) {
    case 'application/pdf':
      return ascii('%PDF');
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case 'image/jpeg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'image/webp':
      return ascii('RIFF') && ascii('WEBP', 8);
    case 'audio/mpeg':
      return ascii('ID3') || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
    case 'audio/wav':
    case 'audio/x-wav':
      return ascii('RIFF') && ascii('WAVE', 8);
    case 'audio/mp4':
    case 'audio/x-m4a':
      return ascii('ftyp', 4);
    case 'text/plain':
      return !bytes.slice(0, 1024).includes(0);
    default:
      return false;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// IDOR guard mirroring the intake service: missing and foreign are identical.
async function getOwnedIntakeDraft(
  intakeStore: IntakeStore,
  consumerKey: string,
  intakeId: string,
  requireDraft = true,
): Promise<void> {
  const intake = await intakeStore.getById(intakeId);
  if (!intake || intake.consumerKey !== consumerKey) {
    throw new ServiceError(404, 'NOT_FOUND', 'Intake not found.');
  }
  if (requireDraft && intake.state !== 'DRAFT') {
    throw new ServiceError(409, 'NOT_EDITABLE', 'This intake has been submitted and can no longer be edited.');
  }
}

async function getOwnedEvidence(
  evidenceStore: EvidenceStore,
  intakeId: string,
  evidenceId: string,
): Promise<EvidenceRecord> {
  const record = await evidenceStore.getById(evidenceId);
  if (!record || record.intakeId !== intakeId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Evidence not found.');
  }
  return record;
}

/** Validates the request and reserves a quarantined slot + storage key. */
export async function requestEvidenceUpload(
  evidenceStore: EvidenceStore,
  intakeStore: IntakeStore,
  consumerKey: string,
  intakeId: string,
  request: EvidenceUploadRequest,
  maxFiles: number = MAX_EVIDENCE_FILES_PER_INTAKE,
): Promise<EvidenceRecord> {
  const parsed = evidenceUploadRequestSchema.parse(request);
  await getOwnedIntakeDraft(intakeStore, consumerKey, intakeId);

  const ext = parsed.filename.split('.').pop()?.toLowerCase() ?? '';
  const allowedMimes = EVIDENCE_ALLOWED_TYPES[ext];
  if (!allowedMimes || !allowedMimes.includes(parsed.mimeType)) {
    throw new ServiceError(422, 'TYPE_NOT_ALLOWED', 'This file type is not supported. Upload a PDF, image, audio file, or plain text.');
  }

  const existing = (await evidenceStore.listByIntake(intakeId)).filter((r) => r.scanStatus !== 'REMOVED');
  if (existing.length >= maxFiles) {
    throw new ServiceError(422, 'EVIDENCE_LIMIT', `A maximum of ${maxFiles} files is supported per intake.`);
  }

  const record: EvidenceRecord = {
    id: crypto.randomUUID(),
    intakeId,
    storageKey: `evidence/${intakeId}/${crypto.randomUUID()}.${ext}`,
    category: parsed.category,
    originalFilename: parsed.filename,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes,
    sha256: null,
    scanStatus: 'PENDING_UPLOAD',
    custody: [],
    createdAt: now(),
    updatedAt: now(),
  };
  custody(record, 'UPLOAD_REQUESTED', `category=${parsed.category}`);
  await evidenceStore.insert(record);
  return record;
}

export interface FinalizeDeps {
  getObject(key: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  deleteObject(key: string): Promise<void>;
  scan(bytes: Uint8Array): Promise<'CLEAN' | 'INFECTED'>;
}

/**
 * Verifies the uploaded bytes (size, magic-byte/MIME match), hashes them,
 * and runs the quarantine scan. Runs inline against the fake scanner today;
 * moves to the jobs queue consumer at deploy without changing callers.
 */
export async function finalizeEvidenceUpload(
  evidenceStore: EvidenceStore,
  intakeStore: IntakeStore,
  consumerKey: string,
  intakeId: string,
  evidenceId: string,
  deps: FinalizeDeps,
): Promise<EvidenceRecord> {
  await getOwnedIntakeDraft(intakeStore, consumerKey, intakeId);
  const record = await getOwnedEvidence(evidenceStore, intakeId, evidenceId);
  if (record.scanStatus !== 'PENDING_UPLOAD') {
    throw new ServiceError(409, 'ALREADY_FINALIZED', 'This upload has already been processed.');
  }

  const object = await deps.getObject(record.storageKey);
  if (!object) {
    throw new ServiceError(422, 'UPLOAD_MISSING', 'The file was not received. Try the upload again.');
  }

  const reject = async (detail: string): Promise<never> => {
    record.scanStatus = 'REJECTED';
    custody(record, 'REJECTED', detail);
    await evidenceStore.update(record);
    await deps.deleteObject(record.storageKey);
    throw new ServiceError(422, 'FILE_REJECTED', 'The file failed validation and was discarded.');
  };

  if (object.bytes.byteLength === 0 || object.bytes.byteLength > record.sizeBytes) {
    return reject(`size mismatch: got ${object.bytes.byteLength}, declared ${record.sizeBytes}`);
  }
  if (!sniffMatches(record.mimeType, object.bytes)) {
    return reject(`content does not match declared type ${record.mimeType}`);
  }

  record.sha256 = await sha256Hex(object.bytes);
  record.scanStatus = 'QUARANTINED';
  custody(record, 'UPLOADED', `sha256=${record.sha256}`);
  await evidenceStore.update(record);

  const verdict = await deps.scan(object.bytes);
  if (verdict === 'INFECTED') {
    record.scanStatus = 'INFECTED';
    custody(record, 'SCAN_INFECTED');
    await evidenceStore.update(record);
    await deps.deleteObject(record.storageKey);
    throw new ServiceError(422, 'FILE_INFECTED', 'The file failed our safety scan and was removed.');
  }
  record.scanStatus = 'CLEAN';
  custody(record, 'SCAN_CLEAN');
  await evidenceStore.update(record);
  return record;
}

/** Soft removal: the object is deleted, the custody trail is retained. */
export async function removeEvidence(
  evidenceStore: EvidenceStore,
  intakeStore: IntakeStore,
  consumerKey: string,
  intakeId: string,
  evidenceId: string,
  deleteObject: (key: string) => Promise<void>,
): Promise<EvidenceRecord> {
  await getOwnedIntakeDraft(intakeStore, consumerKey, intakeId);
  const record = await getOwnedEvidence(evidenceStore, intakeId, evidenceId);
  if (record.scanStatus === 'REMOVED') return record;
  record.scanStatus = 'REMOVED';
  custody(record, 'REMOVED_BY_CONSUMER');
  await evidenceStore.update(record);
  await deleteObject(record.storageKey);
  return record;
}

export async function listEvidence(
  evidenceStore: EvidenceStore,
  intakeStore: IntakeStore,
  consumerKey: string,
  intakeId: string,
): Promise<EvidenceRecord[]> {
  await getOwnedIntakeDraft(intakeStore, consumerKey, intakeId, false);
  return (await evidenceStore.listByIntake(intakeId)).filter((r) => r.scanStatus !== 'REMOVED');
}

/** Strips the storage key (and custody internals) before the HTTP boundary. */
export function toClientEvidence(record: EvidenceRecord): Omit<EvidenceRecord, 'storageKey' | 'custody'> {
  const { storageKey: _storageKey, custody: _custody, ...client } = record;
  return client;
}
