import {
  canTransitionPayment,
  paymentGatePassed,
  type GateStatus,
  type PaymentState,
} from '@stopallcalls/domain';
import type { PaymentMethod, PaymentWebhookEvent } from '@stopallcalls/contracts';
import { ServiceError } from './service';
import type { OrderRecord } from './orders';

// Phase 4 (PAY-003..006): hosted payment fields only (no PAN/CVV ever),
// verified idempotent webhooks, billing-staff-only EMT confirmation. All
// state changes go through the domain payment transition guard (WF-001).

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: string;
  providerRef: string | null;
  method: PaymentMethod;
  state: PaymentState;
  amountCents: number;
  currency: string;
  emtConfirmedBy: string | null;
  /** PAY-004 replay protection: provider event ids already applied. */
  processedEventIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentStore {
  insert(record: PaymentRecord): Promise<void>;
  getById(id: string): Promise<PaymentRecord | null>;
  getByProviderRef(providerRef: string): Promise<PaymentRecord | null>;
  listByOrder(orderId: string): Promise<PaymentRecord[]>;
  update(record: PaymentRecord): Promise<void>;
}

export class InMemoryPaymentStore implements PaymentStore {
  private byId = new Map<string, PaymentRecord>();

  async insert(record: PaymentRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<PaymentRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async getByProviderRef(providerRef: string): Promise<PaymentRecord | null> {
    for (const record of this.byId.values()) {
      if (record.providerRef === providerRef) return structuredClone(record);
    }
    return null;
  }

  async listByOrder(orderId: string): Promise<PaymentRecord[]> {
    return [...this.byId.values()]
      .filter((p) => p.orderId === orderId)
      .map((p) => structuredClone(p));
  }

  async update(record: PaymentRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

/** Structural adapter shape (hosted checkout portion of PaymentAdapter). */
export interface HostedCheckoutProvider {
  createHostedCheckout(input: {
    idempotencyKey: string;
    orderId: string;
    amountCents: number;
    currency: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
}

export interface WebhookVerifier {
  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;
}

const now = (): string => new Date().toISOString();

const ACTIVE_STATES: readonly PaymentState[] = ['PENDING', 'AUTHORIZED', 'PAID', 'AWAITING_EMT', 'EMT_CONFIRMED'];

async function getActivePayment(store: PaymentStore, orderId: string): Promise<PaymentRecord | null> {
  const payments = await store.listByOrder(orderId);
  return payments.find((p) => ACTIVE_STATES.includes(p.state)) ?? null;
}

/**
 * PAY-003: card/Visa-debit checkout through provider-hosted fields. Idempotent
 * per order: an active payment re-issues the same checkout (same idempotency
 * key) instead of creating a second one.
 */
export async function startHostedPayment(
  store: PaymentStore,
  provider: HostedCheckoutProvider,
  order: OrderRecord,
  method: Exclude<PaymentMethod, 'EMT'>,
): Promise<{ payment: PaymentRecord; redirectUrl: string }> {
  const active = await getActivePayment(store, order.id);
  if (active && active.state !== 'PENDING') {
    throw new ServiceError(409, 'PAYMENT_ALREADY_SETTLED', 'A payment for this order is already in progress or complete.');
  }
  const checkout = await provider.createHostedCheckout({
    idempotencyKey: `checkout:${order.id}`,
    orderId: order.id,
    amountCents: order.totalCents,
    currency: order.currency,
  });
  if (active) {
    return { payment: active, redirectUrl: checkout.redirectUrl };
  }
  const record: PaymentRecord = {
    id: crypto.randomUUID(),
    orderId: order.id,
    provider: 'hosted',
    providerRef: checkout.providerRef,
    method,
    state: 'PENDING',
    amountCents: order.totalCents,
    currency: order.currency,
    emtConfirmedBy: null,
    processedEventIds: [],
    createdAt: now(),
    updatedAt: now(),
  };
  await store.insert(record);
  return { payment: record, redirectUrl: checkout.redirectUrl };
}

/** PAY-005: EMT flow — instructions are config, confirmation is billing-staff-only. */
export async function startEmtPayment(store: PaymentStore, order: OrderRecord): Promise<PaymentRecord> {
  const active = await getActivePayment(store, order.id);
  if (active) {
    if (active.method === 'EMT') return active;
    throw new ServiceError(409, 'PAYMENT_ALREADY_SETTLED', 'A payment for this order is already in progress or complete.');
  }
  if (!canTransitionPayment('PENDING', 'AWAITING_EMT')) {
    throw new ServiceError(500, 'INTERNAL', 'Payment state machine rejected the EMT transition.');
  }
  const record: PaymentRecord = {
    id: crypto.randomUUID(),
    orderId: order.id,
    provider: 'emt',
    providerRef: null,
    method: 'EMT',
    state: 'AWAITING_EMT',
    amountCents: order.totalCents,
    currency: order.currency,
    emtConfirmedBy: null,
    processedEventIds: [],
    createdAt: now(),
    updatedAt: now(),
  };
  await store.insert(record);
  return record;
}

const PROVIDER_TARGETS: Record<PaymentWebhookEvent['status'], PaymentState | null> = {
  PENDING: null,
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  // Refunds are post-MVP; the event is recorded (replay-protected) but the
  // state machine has no refund edge yet, so no transition is applied.
  REFUNDED: null,
};

/**
 * PAY-004: apply a verified provider webhook exactly once. The caller passes
 * the RAW payload string; signature verification happens before parsing, and
 * a previously-seen eventId is a successful no-op (replay protection).
 */
export async function applyPaymentWebhook(
  store: PaymentStore,
  verifier: WebhookVerifier,
  rawPayload: string,
  signature: string,
  event: PaymentWebhookEvent,
): Promise<PaymentRecord> {
  if (!(await verifier.verifyWebhookSignature(rawPayload, signature))) {
    throw new ServiceError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
  }
  const payment = await store.getByProviderRef(event.providerRef);
  if (!payment) {
    throw new ServiceError(404, 'NOT_FOUND', 'No payment matches this provider reference.');
  }
  if (payment.processedEventIds.includes(event.eventId)) {
    return payment;
  }
  const target = PROVIDER_TARGETS[event.status];
  if (target !== null) {
    // A provider may settle straight to PAID; the machine still requires the
    // AUTHORIZED step, so the service walks both guarded edges.
    const steps: PaymentState[] =
      target === 'PAID' && payment.state === 'PENDING' ? ['AUTHORIZED', 'PAID'] : [target];
    let current = payment.state;
    for (const step of steps) {
      if (current === step) continue;
      if (!canTransitionPayment(current, step)) {
        throw new ServiceError(409, 'INVALID_TRANSITION', 'This payment cannot accept that provider status.');
      }
      current = step;
    }
    payment.state = current;
  }
  payment.processedEventIds = [...payment.processedEventIds, event.eventId];
  payment.updatedAt = now();
  await store.update(payment);
  return payment;
}

/** PAY-005: only billing staff confirm EMT receipt; the actor is recorded. */
export async function confirmEmtPayment(
  store: PaymentStore,
  paymentId: string,
  actor: { id: string; role: string },
): Promise<PaymentRecord> {
  if (actor.role !== 'BILLING') {
    throw new ServiceError(403, 'FORBIDDEN', 'Only billing staff can confirm EMT payments.');
  }
  if (!actor.id.trim()) {
    throw new ServiceError(422, 'ACTOR_REQUIRED', 'A confirming staff identifier is required.');
  }
  const payment = await store.getById(paymentId);
  if (!payment) {
    throw new ServiceError(404, 'NOT_FOUND', 'Payment not found.');
  }
  if (!canTransitionPayment(payment.state, 'EMT_CONFIRMED')) {
    throw new ServiceError(409, 'INVALID_TRANSITION', 'This payment is not awaiting EMT confirmation.');
  }
  payment.state = 'EMT_CONFIRMED';
  payment.emtConfirmedBy = actor.id.trim();
  payment.updatedAt = now();
  await store.update(payment);
  return payment;
}

/** PAY-006 input: the payment gate as evaluated from recorded payments. */
export function paymentGateFromRecords(payments: PaymentRecord[]): GateStatus {
  if (payments.some((p) => paymentGatePassed(p.state))) return 'PASSED';
  if (payments.length > 0 && payments.every((p) => p.state === 'FAILED' || p.state === 'CANCELLED')) {
    return 'FAILED';
  }
  return 'PENDING';
}
