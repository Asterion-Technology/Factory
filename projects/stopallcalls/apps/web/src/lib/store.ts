import { InMemoryIntakeStore, type IntakeStore } from '@stopallcalls/db';

// Dev-only persistence: survive Next.js HMR by pinning the store to
// globalThis. The D1-backed store replaces this at Cloudflare provisioning.
const KEY = Symbol.for('stopallcalls.intakeStore');

type StoreGlobal = { [KEY]?: IntakeStore };

export function getIntakeStore(): IntakeStore {
  const g = globalThis as StoreGlobal;
  g[KEY] ??= new InMemoryIntakeStore();
  return g[KEY];
}
