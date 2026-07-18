import { appendAuditEvent, type AppendAuditInput } from '@stopallcalls/db';
import { getAuditStore } from '@/lib/store';

/**
 * DATA-004: best-effort append after a successful sensitive action. An audit
 * write failure never rolls back the action it describes (the action already
 * happened); it is surfaced to logs without identifiers for ops follow-up.
 * Detail values must be identifiers/enums only — never PII.
 */
export async function recordAudit(input: AppendAuditInput): Promise<void> {
  try {
    await appendAuditEvent(getAuditStore(), input);
  } catch {
    console.error('audit append failed for a sensitive action');
  }
}
