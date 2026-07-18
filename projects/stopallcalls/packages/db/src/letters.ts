import {
  LETTER_GENERATOR_VERSION,
  buildLetterFields,
  canTransition,
  renderLetterTemplate,
  type GateStatus,
  type MatterState,
} from '@stopallcalls/domain';
import { ServiceError } from './service';
import type { MatterRecord, MatterStore } from './clio';
import type { IntakeRecord } from './types';

// Phase 5 (LTR-001..008 / WF-005): deterministic letter generation, versioning,
// and hash-bound lawyer approval. One letter per matter (= per agency, LTR-002);
// any content change produces a new version and invalidates prior approval.

export interface LetterTemplateRecord {
  id: string;
  jurisdiction: string;
  version: number;
  /** sha256 of the template body; the body itself is stored alongside. */
  contentHash: string;
  body: string;
  publishedAt: string;
  createdAt: string;
}

export interface LetterTemplateStore {
  insert(record: LetterTemplateRecord): Promise<void>;
  getById(id: string): Promise<LetterTemplateRecord | null>;
  getActive(jurisdiction: string): Promise<LetterTemplateRecord | null>;
}

export class InMemoryLetterTemplateStore implements LetterTemplateStore {
  private byId = new Map<string, LetterTemplateRecord>();

  async insert(record: LetterTemplateRecord): Promise<void> {
    for (const existing of this.byId.values()) {
      if (existing.jurisdiction === record.jurisdiction && existing.version === record.version) {
        throw new ServiceError(409, 'VERSION_EXISTS', 'This template version already exists.');
      }
    }
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<LetterTemplateRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async getActive(jurisdiction: string): Promise<LetterTemplateRecord | null> {
    const candidates = [...this.byId.values()]
      .filter((t) => t.jurisdiction === jurisdiction)
      .sort((a, b) => b.version - a.version);
    return candidates[0] ? structuredClone(candidates[0]) : null;
  }
}

export type LetterVersionStatus =
  | 'DRAFT_READY'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'SUPERSEDED'
  | 'SENT';

export interface LetterVersionRecord {
  id: string;
  matterId: string;
  templateId: string;
  templateVersion: number;
  /** LTR-005: exact inputs used, including the rendered content. */
  sourceSnapshot: { fields: Record<string, string>; renderedContent: string };
  generatorVersion: string;
  /** sha256 of the rendered content — approval binds to this (WF-005). */
  contentHash: string;
  pdfSha256: string | null;
  status: LetterVersionStatus;
  author: string;
  createdAt: string;
}

export interface LetterVersionStore {
  insert(record: LetterVersionRecord): Promise<void>;
  getById(id: string): Promise<LetterVersionRecord | null>;
  listByMatter(matterId: string): Promise<LetterVersionRecord[]>;
  update(record: LetterVersionRecord): Promise<void>;
}

export class InMemoryLetterVersionStore implements LetterVersionStore {
  private byId = new Map<string, LetterVersionRecord>();

  async insert(record: LetterVersionRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<LetterVersionRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async listByMatter(matterId: string): Promise<LetterVersionRecord[]> {
    return [...this.byId.values()]
      .filter((v) => v.matterId === matterId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((v) => structuredClone(v));
  }

  async update(record: LetterVersionRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

export interface ApprovalRecord {
  id: string;
  letterVersionId: string;
  approverId: string;
  /** LTR-007: the exact content hash the human reviewed. */
  letterContentHash: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string | null;
  decidedAt: string;
}

export interface ApprovalStore {
  insert(record: ApprovalRecord): Promise<void>;
  listByLetterVersion(letterVersionId: string): Promise<ApprovalRecord[]>;
}

export class InMemoryApprovalStore implements ApprovalStore {
  private byId = new Map<string, ApprovalRecord>();

  async insert(record: ApprovalRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async listByLetterVersion(letterVersionId: string): Promise<ApprovalRecord[]> {
    return [...this.byId.values()]
      .filter((a) => a.letterVersionId === letterVersionId)
      .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
      .map((a) => structuredClone(a));
  }
}

export interface PdfRenderer {
  render(input: { templateId: string; data: Record<string, string> }): Promise<{ bytes: Uint8Array; sha256: string }>;
}

const now = (): string => new Date().toISOString();

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Template publishing is append-only; versions are immutable (like retainers). */
export async function publishLetterTemplate(
  store: LetterTemplateStore,
  input: { jurisdiction: string; version: number; body: string },
): Promise<LetterTemplateRecord> {
  if (!input.body.trim()) {
    throw new ServiceError(422, 'EMPTY_TEMPLATE', 'Template body is required.');
  }
  const record: LetterTemplateRecord = {
    id: crypto.randomUUID(),
    jurisdiction: input.jurisdiction,
    version: input.version,
    contentHash: await sha256Hex(input.body),
    body: input.body,
    publishedAt: now(),
    createdAt: now(),
  };
  await store.insert(record);
  return record;
}

async function transitionMatter(matters: MatterStore, matter: MatterRecord, to: MatterState): Promise<MatterRecord> {
  if (matter.state === to) return matter;
  if (!canTransition(matter.state, to)) {
    throw new ServiceError(409, 'INVALID_TRANSITION', `Matter cannot move to ${to} from its current state.`);
  }
  matter.state = to;
  matter.updatedAt = now();
  await matters.update(matter);
  return matter;
}

export interface GenerateLetterDeps {
  templates: LetterTemplateStore;
  versions: LetterVersionStore;
  matters: MatterStore;
  pdf: PdfRenderer;
}

/**
 * LTR-001/002/005: deterministic generation from the frozen snapshot's verified
 * fields. Regenerating with unchanged inputs is a no-op returning the current
 * version; changed inputs supersede prior unsent versions, and a previously
 * APPROVED matter reverts to IN_REVIEW (WF-005).
 */
export async function generateLetterVersion(
  deps: GenerateLetterDeps,
  intake: IntakeRecord,
  matterId: string,
  input: { author: string; letterDate: string },
): Promise<LetterVersionRecord> {
  const matter = await deps.matters.getById(matterId);
  if (!matter) throw new ServiceError(404, 'NOT_FOUND', 'Matter not found.');
  const snapshot = intake.submittedSnapshot;
  if (!snapshot || matter.intakeId !== intake.id) {
    throw new ServiceError(409, 'NOT_SUBMITTED', 'The intake and matter do not match a frozen submission.');
  }
  const agency = snapshot.agencies.find((a) => a.id === matter.agencyId);
  if (!agency) throw new ServiceError(409, 'AGENCY_MISSING', 'The matter has no agency in the snapshot.');
  const template = await deps.templates.getActive(intake.jurisdiction);
  if (!template) throw new ServiceError(409, 'NO_TEMPLATE', 'No published letter template exists for this jurisdiction.');

  const fields = buildLetterFields({
    consumerFirstName: snapshot.profile.firstName,
    consumerLastName: snapshot.profile.lastName,
    agencyName: agency.entry.agencyName,
    ...(agency.entry.originalCreditor ? { originalCreditor: agency.entry.originalCreditor } : {}),
    ...(agency.entry.accountNumberLast4 ? { accountLast4: agency.entry.accountNumberLast4 } : {}),
    ...(typeof agency.entry.amountClaimedCents === 'number'
      ? { amountClaimedCents: agency.entry.amountClaimedCents, currency: agency.entry.currency }
      : {}),
    matterDisplayNumber: matter.displayNumber,
    letterDate: input.letterDate,
  });
  const renderedContent = renderLetterTemplate(template.body, fields);
  const contentHash = await sha256Hex(renderedContent);

  const existing = await deps.versions.listByMatter(matterId);
  const current = existing.filter((v) => v.status !== 'SUPERSEDED' && v.status !== 'SENT').at(-1);
  if (current && current.contentHash === contentHash) return current;

  if (current) {
    current.status = 'SUPERSEDED';
    await deps.versions.update(current);
  }
  // WF-005: content changed after approval — the matter returns to review and
  // the machine has no IN_REVIEW → DRAFT_READY edge, so the replacement
  // version enters review directly for a fresh hash-bound decision.
  const revertedFromApproval = matter.state === 'APPROVED';
  if (revertedFromApproval) {
    await transitionMatter(deps.matters, matter, 'IN_REVIEW');
  }
  const pdf = await deps.pdf.render({ templateId: `letter-${template.jurisdiction}-v${template.version}`, data: fields });
  const record: LetterVersionRecord = {
    id: crypto.randomUUID(),
    matterId,
    templateId: template.id,
    templateVersion: template.version,
    sourceSnapshot: { fields, renderedContent },
    generatorVersion: LETTER_GENERATOR_VERSION,
    contentHash,
    pdfSha256: pdf.sha256,
    status: revertedFromApproval ? 'IN_REVIEW' : 'DRAFT_READY',
    author: input.author,
    createdAt: now(),
  };
  await deps.versions.insert(record);
  if (!revertedFromApproval) {
    if (matter.state === 'MATTER_CREATED' || matter.state === 'CHANGES_REQUESTED') {
      await transitionMatter(deps.matters, matter, 'DRAFT_PENDING');
    }
    await transitionMatter(deps.matters, matter, 'DRAFT_READY');
  }
  return record;
}

/** Moves the current draft into lawyer review (LTR-006 workspace reads it). */
export async function submitLetterForReview(
  stores: { versions: LetterVersionStore; matters: MatterStore },
  letterVersionId: string,
): Promise<LetterVersionRecord> {
  const version = await stores.versions.getById(letterVersionId);
  if (!version) throw new ServiceError(404, 'NOT_FOUND', 'Letter version not found.');
  if (version.status !== 'DRAFT_READY') {
    throw new ServiceError(409, 'INVALID_TRANSITION', 'Only a ready draft can enter review.');
  }
  const matter = await stores.matters.getById(version.matterId);
  if (!matter) throw new ServiceError(404, 'NOT_FOUND', 'Matter not found.');
  await transitionMatter(stores.matters, matter, 'IN_REVIEW');
  version.status = 'IN_REVIEW';
  await stores.versions.update(version);
  return version;
}

/**
 * LTR-007/LTR-008: lawyer-only, hash-bound decision. The approver restates the
 * exact content hash they reviewed; any mismatch (stale tab, superseded
 * version) is rejected before a decision is recorded.
 */
export async function decideLetterApproval(
  stores: { versions: LetterVersionStore; matters: MatterStore; approvals: ApprovalStore },
  letterVersionId: string,
  input: {
    actor: { id: string; role: string };
    contentHash: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string;
  },
): Promise<{ version: LetterVersionRecord; approval: ApprovalRecord }> {
  if (input.actor.role !== 'LAWYER') {
    throw new ServiceError(403, 'FORBIDDEN', 'Only a lawyer can decide letter approval.');
  }
  if (!input.actor.id.trim()) {
    throw new ServiceError(422, 'ACTOR_REQUIRED', 'An approver identifier is required.');
  }
  if (input.decision === 'REJECTED' && !input.reason?.trim()) {
    throw new ServiceError(422, 'REASON_REQUIRED', 'A reason is required to request changes.');
  }
  const version = await stores.versions.getById(letterVersionId);
  if (!version) throw new ServiceError(404, 'NOT_FOUND', 'Letter version not found.');
  if (version.status !== 'IN_REVIEW') {
    throw new ServiceError(409, 'NOT_IN_REVIEW', 'This letter version is not in review.');
  }
  if (input.contentHash !== version.contentHash) {
    throw new ServiceError(409, 'HASH_MISMATCH', 'The reviewed content does not match this version. Reload and re-review.');
  }
  const matter = await stores.matters.getById(version.matterId);
  if (!matter) throw new ServiceError(404, 'NOT_FOUND', 'Matter not found.');

  const approval: ApprovalRecord = {
    id: crypto.randomUUID(),
    letterVersionId: version.id,
    approverId: input.actor.id.trim(),
    letterContentHash: input.contentHash,
    decision: input.decision,
    reason: input.reason?.trim() ?? null,
    decidedAt: now(),
  };
  await stores.approvals.insert(approval);
  if (input.decision === 'APPROVED') {
    await transitionMatter(stores.matters, matter, 'APPROVED');
    version.status = 'APPROVED';
  } else {
    await transitionMatter(stores.matters, matter, 'CHANGES_REQUESTED');
    version.status = 'CHANGES_REQUESTED';
  }
  await stores.versions.update(version);
  return { version, approval };
}

/** LEGAL_APPROVAL gate input: a valid approval bound to the current hash. */
export async function legalApprovalGateForMatter(
  stores: { versions: LetterVersionStore; approvals: ApprovalStore },
  matterId: string,
): Promise<GateStatus> {
  const versions = await stores.versions.listByMatter(matterId);
  const current = versions.filter((v) => v.status !== 'SUPERSEDED').at(-1);
  if (!current) return 'PENDING';
  const approvals = await stores.approvals.listByLetterVersion(current.id);
  const valid = approvals.some(
    (a) => a.decision === 'APPROVED' && a.letterContentHash === current.contentHash,
  );
  if (valid && (current.status === 'APPROVED' || current.status === 'SENT')) return 'PASSED';
  if (current.status === 'CHANGES_REQUESTED') return 'MANUAL_REVIEW';
  return 'PENDING';
}
