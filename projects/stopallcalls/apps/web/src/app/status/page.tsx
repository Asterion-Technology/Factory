import StatusTracker from './StatusTracker';

// UI-001: consumer case-status dashboard (Phase 6). All progress states come
// from the consumer-safe status API; nothing here computes legal state.
export default function StatusPage() {
  return (
    <main>
      <h1>Your case status</h1>
      <StatusTracker />
    </main>
  );
}
