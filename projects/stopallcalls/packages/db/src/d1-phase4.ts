import type { D1Like } from './d1';
import type { IdentityRecord, IdentityStore } from './identity';
import type { OrderRecord, OrderStore } from './orders';
import type { PaymentRecord, PaymentStore } from './payments';
import type {
  RetainerSignatureRecord,
  RetainerSignatureStore,
  RetainerVersionRecord,
  RetainerVersionStore,
} from './retainer';

// Phase 4 D1-backed stores (migration 0003). Same conventions as d1.ts:
// snake_case rows, JSON columns for structured fields, no runtime deps.

interface OrderRow {
  id: string;
  intake_id: string;
  pricing_snapshot_json: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  created_at: string;
}

const toOrder = (row: OrderRow): OrderRecord => ({
  id: row.id,
  intakeId: row.intake_id,
  pricing: JSON.parse(row.pricing_snapshot_json),
  subtotalCents: row.subtotal_cents,
  taxCents: row.tax_cents,
  totalCents: row.total_cents,
  currency: row.currency,
  createdAt: row.created_at,
});

export class D1OrderStore implements OrderStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: OrderRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO orders (id, intake_id, pricing_snapshot_json, subtotal_cents, tax_cents,
           total_cents, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.intakeId,
        JSON.stringify(record.pricing),
        record.subtotalCents,
        record.taxCents,
        record.totalCents,
        record.currency,
        record.createdAt,
      )
      .run();
  }

  async getById(id: string): Promise<OrderRecord | null> {
    const row = await this.db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
    return row ? toOrder(row) : null;
  }

  async getByIntake(intakeId: string): Promise<OrderRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM orders WHERE intake_id = ? LIMIT 1')
      .bind(intakeId)
      .first<OrderRow>();
    return row ? toOrder(row) : null;
  }
}

interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  method: string;
  status: string;
  amount_cents: number;
  currency: string;
  emt_confirmed_by: string | null;
  webhook_state_json: string | null;
  created_at: string;
  updated_at: string;
}

const toPayment = (row: PaymentRow): PaymentRecord => ({
  id: row.id,
  orderId: row.order_id,
  provider: row.provider,
  providerRef: row.provider_ref,
  method: row.method as PaymentRecord['method'],
  state: row.status as PaymentRecord['state'],
  amountCents: row.amount_cents,
  currency: row.currency,
  emtConfirmedBy: row.emt_confirmed_by,
  processedEventIds: row.webhook_state_json ? JSON.parse(row.webhook_state_json) : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1PaymentStore implements PaymentStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: PaymentRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO payments (id, order_id, provider, provider_ref, method, status, amount_cents,
           currency, emt_confirmed_by, webhook_state_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.orderId,
        record.provider,
        record.providerRef,
        record.method,
        record.state,
        record.amountCents,
        record.currency,
        record.emtConfirmedBy,
        JSON.stringify(record.processedEventIds),
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getById(id: string): Promise<PaymentRecord | null> {
    const row = await this.db.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first<PaymentRow>();
    return row ? toPayment(row) : null;
  }

  async getByProviderRef(providerRef: string): Promise<PaymentRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM payments WHERE provider_ref = ?')
      .bind(providerRef)
      .first<PaymentRow>();
    return row ? toPayment(row) : null;
  }

  async listByOrder(orderId: string): Promise<PaymentRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at')
      .bind(orderId)
      .all<PaymentRow>();
    return results.map(toPayment);
  }

  async update(record: PaymentRecord): Promise<void> {
    await this.db
      .prepare(
        `UPDATE payments SET status = ?, emt_confirmed_by = ?, webhook_state_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        record.state,
        record.emtConfirmedBy,
        JSON.stringify(record.processedEventIds),
        record.updatedAt,
        record.id,
      )
      .run();
  }
}

interface IdentityRow {
  id: string;
  intake_id: string;
  provider: string;
  provider_ref: string;
  status: string;
  checks_json: string | null;
  webhook_event_ids_json: string;
  override_by: string | null;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

const toIdentity = (row: IdentityRow): IdentityRecord => ({
  id: row.id,
  intakeId: row.intake_id,
  provider: row.provider,
  providerRef: row.provider_ref,
  status: row.status as IdentityRecord['status'],
  checks: row.checks_json ? JSON.parse(row.checks_json) : null,
  processedEventIds: JSON.parse(row.webhook_event_ids_json),
  overrideBy: row.override_by,
  overrideReason: row.override_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1IdentityStore implements IdentityStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: IdentityRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO identity_verifications (id, intake_id, provider, provider_ref, status,
           checks_json, webhook_event_ids_json, override_by, override_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.intakeId,
        record.provider,
        record.providerRef,
        record.status,
        record.checks ? JSON.stringify(record.checks) : null,
        JSON.stringify(record.processedEventIds),
        record.overrideBy,
        record.overrideReason,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getById(id: string): Promise<IdentityRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM identity_verifications WHERE id = ?')
      .bind(id)
      .first<IdentityRow>();
    return row ? toIdentity(row) : null;
  }

  async getByIntake(intakeId: string): Promise<IdentityRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM identity_verifications WHERE intake_id = ? ORDER BY created_at LIMIT 1')
      .bind(intakeId)
      .first<IdentityRow>();
    return row ? toIdentity(row) : null;
  }

  async getByProviderRef(providerRef: string): Promise<IdentityRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM identity_verifications WHERE provider_ref = ?')
      .bind(providerRef)
      .first<IdentityRow>();
    return row ? toIdentity(row) : null;
  }

  async update(record: IdentityRecord): Promise<void> {
    await this.db
      .prepare(
        `UPDATE identity_verifications SET provider_ref = ?, status = ?, checks_json = ?, webhook_event_ids_json = ?,
           override_by = ?, override_reason = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        record.providerRef,
        record.status,
        record.checks ? JSON.stringify(record.checks) : null,
        JSON.stringify(record.processedEventIds),
        record.overrideBy,
        record.overrideReason,
        record.updatedAt,
        record.id,
      )
      .run();
  }
}

interface RetainerVersionRow {
  id: string;
  jurisdiction: string;
  language: string;
  effective_date: string;
  content_hash: string;
  r2_key: string;
  published_at: string | null;
  created_at: string;
}

const toRetainerVersion = (row: RetainerVersionRow): RetainerVersionRecord => ({
  id: row.id,
  jurisdiction: row.jurisdiction,
  language: row.language,
  effectiveDate: row.effective_date,
  contentHash: row.content_hash,
  storageKey: row.r2_key,
  publishedAt: row.published_at ?? row.created_at,
  createdAt: row.created_at,
});

export class D1RetainerVersionStore implements RetainerVersionStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: RetainerVersionRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO retainer_versions (id, jurisdiction, language, effective_date, content_hash,
           r2_key, published_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.jurisdiction,
        record.language,
        record.effectiveDate,
        record.contentHash,
        record.storageKey,
        record.publishedAt,
        record.createdAt,
      )
      .run();
  }

  async getById(id: string): Promise<RetainerVersionRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM retainer_versions WHERE id = ?')
      .bind(id)
      .first<RetainerVersionRow>();
    return row ? toRetainerVersion(row) : null;
  }

  async getActive(jurisdiction: string): Promise<RetainerVersionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM retainer_versions WHERE jurisdiction = ? AND published_at IS NOT NULL
         ORDER BY published_at DESC LIMIT 1`,
      )
      .bind(jurisdiction)
      .first<RetainerVersionRow>();
    return row ? toRetainerVersion(row) : null;
  }
}

interface RetainerSignatureRow {
  id: string;
  intake_id: string;
  retainer_version_id: string;
  content_hash: string;
  signer_ref: string;
  provider_envelope_id: string;
  signed_at: string | null;
  evidence_json: string | null;
  created_at: string;
  updated_at: string;
}

const toRetainerSignature = (row: RetainerSignatureRow): RetainerSignatureRecord => ({
  id: row.id,
  intakeId: row.intake_id,
  retainerVersionId: row.retainer_version_id,
  contentHash: row.content_hash,
  signerRef: row.signer_ref,
  providerEnvelopeId: row.provider_envelope_id,
  signedAt: row.signed_at,
  evidence: row.evidence_json ? JSON.parse(row.evidence_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1RetainerSignatureStore implements RetainerSignatureStore {
  constructor(private readonly db: D1Like) {}

  async insert(record: RetainerSignatureRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO retainer_signatures (id, intake_id, retainer_version_id, content_hash,
           signer_ref, provider_envelope_id, signed_at, evidence_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.intakeId,
        record.retainerVersionId,
        record.contentHash,
        record.signerRef,
        record.providerEnvelopeId,
        record.signedAt,
        record.evidence ? JSON.stringify(record.evidence) : null,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getByIntake(intakeId: string): Promise<RetainerSignatureRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM retainer_signatures WHERE intake_id = ?')
      .bind(intakeId)
      .first<RetainerSignatureRow>();
    return row ? toRetainerSignature(row) : null;
  }

  async getByEnvelope(envelopeId: string): Promise<RetainerSignatureRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM retainer_signatures WHERE provider_envelope_id = ?')
      .bind(envelopeId)
      .first<RetainerSignatureRow>();
    return row ? toRetainerSignature(row) : null;
  }

  async update(record: RetainerSignatureRecord): Promise<void> {
    await this.db
      .prepare('UPDATE retainer_signatures SET signed_at = ?, evidence_json = ?, updated_at = ? WHERE id = ?')
      .bind(
        record.signedAt,
        record.evidence ? JSON.stringify(record.evidence) : null,
        record.updatedAt,
        record.id,
      )
      .run();
  }
}
