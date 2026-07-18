// RAD-17: market config store. Two implementations like every other store —
// seeded in-memory for local dev/E2E, D1 (migration 0005) deployed. Updates
// are staff-only at the API layer and always audited there (UI-006).

import type { MarketCode, MarketConfig, MarketStatus } from '@stopallcalls/domain';

export interface MarketUpdate {
  status?: MarketStatus;
  regions?: string[];
}

export interface MarketStore {
  list(): Promise<MarketConfig[]>;
  get(code: MarketCode): Promise<MarketConfig | null>;
  update(code: MarketCode, patch: MarketUpdate, updatedBy: string, at: string): Promise<MarketConfig | null>;
}

const CA_LAUNCH_REGIONS = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'SK', 'YT'];

export function defaultMarkets(): MarketConfig[] {
  const at = '2026-07-18T00:00:00.000Z';
  return [
    { code: 'CA', status: 'active', regions: [...CA_LAUNCH_REGIONS], updatedBy: 'seed:RAD-17', updatedAt: at },
    { code: 'US', status: 'dormant', regions: [], updatedBy: 'seed:RAD-17', updatedAt: at },
  ];
}

export class InMemoryMarketStore implements MarketStore {
  private byCode = new Map(defaultMarkets().map((m) => [m.code, m]));

  async list(): Promise<MarketConfig[]> {
    return [...this.byCode.values()].map((m) => ({ ...m, regions: [...m.regions] }));
  }

  async get(code: MarketCode): Promise<MarketConfig | null> {
    const m = this.byCode.get(code);
    return m ? { ...m, regions: [...m.regions] } : null;
  }

  async update(code: MarketCode, patch: MarketUpdate, updatedBy: string, at: string): Promise<MarketConfig | null> {
    const m = this.byCode.get(code);
    if (!m) return null;
    const next: MarketConfig = {
      ...m,
      status: patch.status ?? m.status,
      regions: patch.regions ? [...patch.regions] : m.regions,
      updatedBy,
      updatedAt: at,
    };
    this.byCode.set(code, next);
    return this.get(code);
  }
}

interface MarketRow {
  code: string;
  status: string;
  provinces_json: string;
  updated_by: string;
  updated_at: string;
}

import type { D1Like } from './d1';

function toMarket(row: MarketRow): MarketConfig {
  return {
    code: row.code as MarketCode,
    status: row.status as MarketStatus,
    regions: JSON.parse(row.provinces_json) as string[],
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export class D1MarketStore implements MarketStore {
  constructor(private readonly db: D1Like) {}

  async list(): Promise<MarketConfig[]> {
    const { results } = await this.db.prepare('SELECT * FROM markets ORDER BY code').all<MarketRow>();
    return (results ?? []).map(toMarket);
  }

  async get(code: MarketCode): Promise<MarketConfig | null> {
    const row = await this.db.prepare('SELECT * FROM markets WHERE code = ?').bind(code).first<MarketRow>();
    return row ? toMarket(row) : null;
  }

  async update(code: MarketCode, patch: MarketUpdate, updatedBy: string, at: string): Promise<MarketConfig | null> {
    const current = await this.get(code);
    if (!current) return null;
    await this.db
      .prepare('UPDATE markets SET status = ?, provinces_json = ?, updated_by = ?, updated_at = ? WHERE code = ?')
      .bind(patch.status ?? current.status, JSON.stringify(patch.regions ?? current.regions), updatedBy, at, code)
      .run();
    return this.get(code);
  }
}
