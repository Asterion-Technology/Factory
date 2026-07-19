// RAD-19 CLI: seed-data/agencies/*.csv -> seed-data/agencies/seed.sql.
// Run: pnpm --filter @stopallcalls/db agencies:build-seed
// Both the CSVs and the generated seed.sql are checked in so registry
// refreshes show up as reviewable diffs.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeedSql, parseSeedCsv, type AgencySeedRecord } from './agency-seed-lib';

const dataDir = join(import.meta.dirname, '..', 'seed-data', 'agencies');
const csvFiles = readdirSync(dataDir).filter((f) => f.endsWith('.csv')).sort();
if (csvFiles.length === 0) {
  console.error(`no CSV files found in ${dataDir}`);
  process.exit(1);
}

const records: AgencySeedRecord[] = [];
for (const file of csvFiles) {
  const parsed = parseSeedCsv(file, readFileSync(join(dataDir, file), 'utf8'));
  console.error(`${file}: ${parsed.length} rows`);
  records.push(...parsed);
}

const out = join(dataDir, 'seed.sql');
writeFileSync(out, buildSeedSql(records, csvFiles));
console.error(`wrote ${records.length} upserts -> ${out}`);
