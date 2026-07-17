import { describe, expect, it } from 'vitest';
import {
  InMemoryEvidenceStore,
  InMemoryIntakeStore,
  createOrResumeIntake,
  finalizeEvidenceUpload,
  listEvidence,
  removeEvidence,
  requestEvidenceUpload,
  toClientEvidence,
  type FinalizeDeps,
} from '../src/index';

const CONSUMER = 'taylor.testcase@example.test';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MARKER = 'FAKE-MALWARE-SIGNATURE';

const PNG_REQUEST = {
  category: 'SCREENSHOT' as const,
  filename: 'call-screenshot.png',
  mimeType: 'image/png',
  sizeBytes: PNG_BYTES.byteLength,
};

async function harness() {
  const evidence = new InMemoryEvidenceStore();
  const intakes = new InMemoryIntakeStore();
  const intake = await createOrResumeIntake(intakes, CONSUMER);
  const objects = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const deleted: string[] = [];
  const deps: FinalizeDeps = {
    getObject: async (key) => objects.get(key) ?? null,
    deleteObject: async (key) => {
      objects.delete(key);
      deleted.push(key);
    },
    scan: async (bytes) => (new TextDecoder().decode(bytes).includes(MARKER) ? 'INFECTED' : 'CLEAN'),
  };
  return { evidence, intakes, intake, objects, deleted, deps };
}

describe('requestEvidenceUpload (EVD-004/006)', () => {
  it('reserves a non-guessable storage key in PENDING_UPLOAD', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST);
    expect(record.scanStatus).toBe('PENDING_UPLOAD');
    expect(record.storageKey).toMatch(new RegExp(`^evidence/${h.intake.id}/[0-9a-f-]{36}\\.png$`));
  });

  it('rejects disallowed extensions and MIME mismatches', async () => {
    const h = await harness();
    await expect(
      requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, {
        ...PNG_REQUEST,
        filename: 'evil.exe',
        mimeType: 'application/octet-stream',
      }),
    ).rejects.toMatchObject({ code: 'TYPE_NOT_ALLOWED' });
    await expect(
      requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, {
        ...PNG_REQUEST,
        mimeType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ code: 'TYPE_NOT_ALLOWED' });
  });

  it('rejects path-traversal filenames at the schema layer', async () => {
    const h = await harness();
    await expect(
      requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, {
        ...PNG_REQUEST,
        filename: '../../etc/passwd.png',
      }),
    ).rejects.toThrow();
  });

  it('enforces the per-intake file cap', async () => {
    const h = await harness();
    await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST, 1);
    await expect(
      requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST, 1),
    ).rejects.toMatchObject({ code: 'EVIDENCE_LIMIT' });
  });

  it('is IDOR-safe: foreign intakes read as missing', async () => {
    const h = await harness();
    await expect(
      requestEvidenceUpload(h.evidence, h.intakes, 'attacker@example.test', h.intake.id, PNG_REQUEST),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('finalizeEvidenceUpload (EVD-004/005/007)', () => {
  it('hashes, quarantines, scans clean, and records custody', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST);
    h.objects.set(record.storageKey, { bytes: PNG_BYTES, mimeType: 'image/png' });
    const done = await finalizeEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps);
    expect(done.scanStatus).toBe('CLEAN');
    expect(done.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done.custody.map((c) => c.action)).toEqual(['UPLOAD_REQUESTED', 'UPLOADED', 'SCAN_CLEAN']);
  });

  it('rejects when nothing was uploaded', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST);
    await expect(
      finalizeEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps),
    ).rejects.toMatchObject({ code: 'UPLOAD_MISSING' });
  });

  it('rejects content that does not match the declared type and deletes it', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST);
    h.objects.set(record.storageKey, {
      bytes: new TextEncoder().encode('MZ this is not a png'),
      mimeType: 'image/png',
    });
    await expect(
      finalizeEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps),
    ).rejects.toMatchObject({ code: 'FILE_REJECTED' });
    expect((await h.evidence.getById(record.id))?.scanStatus).toBe('REJECTED');
    expect(h.deleted).toContain(record.storageKey);
  });

  it('deletes infected files and marks them INFECTED (EVD-005)', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, {
      ...PNG_REQUEST,
      filename: 'notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
    });
    h.objects.set(record.storageKey, {
      bytes: new TextEncoder().encode(`hello ${MARKER}`),
      mimeType: 'text/plain',
    });
    await expect(
      finalizeEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps),
    ).rejects.toMatchObject({ code: 'FILE_INFECTED' });
    expect((await h.evidence.getById(record.id))?.scanStatus).toBe('INFECTED');
    expect(h.deleted).toContain(record.storageKey);
  });

  it('cannot be finalized twice', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST);
    h.objects.set(record.storageKey, { bytes: PNG_BYTES, mimeType: 'image/png' });
    await finalizeEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps);
    await expect(
      finalizeEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps),
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
  });
});

describe('removeEvidence + listEvidence', () => {
  it('soft-removes: object deleted, custody retained, hidden from lists', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST);
    h.objects.set(record.storageKey, { bytes: PNG_BYTES, mimeType: 'image/png' });
    await finalizeEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps);
    await removeEvidence(h.evidence, h.intakes, CONSUMER, h.intake.id, record.id, h.deps.deleteObject);
    expect(await listEvidence(h.evidence, h.intakes, CONSUMER, h.intake.id)).toHaveLength(0);
    const stored = await h.evidence.getById(record.id);
    expect(stored?.scanStatus).toBe('REMOVED');
    expect(stored?.custody.at(-1)?.action).toBe('REMOVED_BY_CONSUMER');
  });
});

describe('toClientEvidence', () => {
  it('never leaks the storage key or custody internals', async () => {
    const h = await harness();
    const record = await requestEvidenceUpload(h.evidence, h.intakes, CONSUMER, h.intake.id, PNG_REQUEST);
    const client = toClientEvidence(record);
    expect(Object.keys(client)).not.toContain('storageKey');
    expect(Object.keys(client)).not.toContain('custody');
  });
});
