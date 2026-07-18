import fs from 'node:fs';
import path from 'node:path';

let cache = null;

export function loadPricing(factoryRoot) {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(path.join(factoryRoot, 'config', 'model-pricing.json'), 'utf8'));
  }
  return cache;
}

function rateFor(pricing, model) {
  if (pricing.models[model]) return pricing.models[model];
  // prefix match handles dated snapshots like claude-haiku-4-5-20251001
  const hit = Object.keys(pricing.models).find((k) => model.startsWith(k));
  return hit ? pricing.models[hit] : pricing.fallback;
}

// usage: {in, out, cacheWrite5m, cacheWrite1h, cacheRead} token totals
export function costUsd(pricing, model, u) {
  const r = rateFor(pricing, model);
  const perTok = (n, perM) => ((n || 0) * perM) / 1e6;
  return (
    perTok(u.in, r.input) +
    perTok(u.out, r.output) +
    perTok(u.cacheWrite5m, r.cacheWrite5m) +
    perTok(u.cacheWrite1h, r.cacheWrite1h) +
    perTok(u.cacheRead, r.cacheRead)
  );
}

export function providerFor(pricing, model) {
  return rateFor(pricing, model).provider || 'anthropic';
}
