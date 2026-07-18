import { calculateOrder, type PricingConfig, type PricingSnapshot } from '@stopallcalls/domain';
import { ServiceError } from './service';
import type { IntakeRecord } from './types';

// Phase 4 (PAY-001/PAY-002): orders are priced server-side from the frozen
// submission snapshot — client input never reaches the calculation.

export interface OrderRecord {
  id: string;
  intakeId: string;
  pricing: PricingSnapshot;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
}

export interface OrderStore {
  insert(record: OrderRecord): Promise<void>;
  getById(id: string): Promise<OrderRecord | null>;
  getByIntake(intakeId: string): Promise<OrderRecord | null>;
}

export class InMemoryOrderStore implements OrderStore {
  private byId = new Map<string, OrderRecord>();

  async insert(record: OrderRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<OrderRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async getByIntake(intakeId: string): Promise<OrderRecord | null> {
    for (const record of this.byId.values()) {
      if (record.intakeId === intakeId) return structuredClone(record);
    }
    return null;
  }
}

/**
 * One order per intake, priced from the immutable snapshot's agency count.
 * Idempotent: an existing order is returned as-is so retries and repeat
 * checkout visits never re-price or duplicate.
 */
export async function createOrderForIntake(
  store: OrderStore,
  config: PricingConfig,
  intake: IntakeRecord,
): Promise<OrderRecord> {
  const existing = await store.getByIntake(intake.id);
  if (existing) return existing;
  if (!intake.submittedSnapshot) {
    throw new ServiceError(409, 'NOT_SUBMITTED', 'The intake has not been submitted.');
  }
  const pricing = calculateOrder(config, intake.submittedSnapshot.agencies.length, new Date().toISOString());
  const record: OrderRecord = {
    id: crypto.randomUUID(),
    intakeId: intake.id,
    pricing,
    subtotalCents: pricing.subtotalCents,
    taxCents: pricing.taxCents,
    totalCents: pricing.totalCents,
    currency: pricing.currency,
    createdAt: pricing.calculatedAt,
  };
  await store.insert(record);
  return record;
}
