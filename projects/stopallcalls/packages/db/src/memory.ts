import type { IntakeRecord, IntakeStore } from './types';

const clone = <T>(value: T): T => structuredClone(value);

// Development/test store (DEV-003). The D1-backed store replaces this once
// Cloudflare resources are provisioned; both sit behind IntakeStore.
export class InMemoryIntakeStore implements IntakeStore {
  private byId = new Map<string, IntakeRecord>();

  async insert(record: IntakeRecord): Promise<void> {
    this.byId.set(record.id, clone(record));
  }

  async getById(id: string): Promise<IntakeRecord | null> {
    const record = this.byId.get(id);
    return record ? clone(record) : null;
  }

  async findActiveByConsumer(consumerKey: string): Promise<IntakeRecord | null> {
    for (const record of this.byId.values()) {
      if (
        record.consumerKey === consumerKey &&
        record.state !== 'CLOSED' &&
        record.state !== 'CANCELLED'
      ) {
        return clone(record);
      }
    }
    return null;
  }

  async update(record: IntakeRecord, expectedVersion: number): Promise<boolean> {
    const current = this.byId.get(record.id);
    if (!current || current.version !== expectedVersion) return false;
    this.byId.set(record.id, clone({ ...record, version: expectedVersion + 1 }));
    return true;
  }
}
