import { z } from 'zod';

// Phase 2 (RAD-11): evidence intake. Server-side validation limits (EVD-004);
// every value here is a working default pending product-owner confirmation.

export const evidenceCategorySchema = z.enum([
  'COLLECTION_LETTER',
  'SCREENSHOT',
  'CALL_LOG',
  'VOICEMAIL',
  'EMAIL_TEXT',
  'CREDIT_REPORT',
]);

export const MAX_EVIDENCE_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_EVIDENCE_FILES_PER_INTAKE = 30;

// Extension allowlist with the MIME types each may declare (EVD-004).
// Anything not listed is rejected before an upload URL is ever issued.
export const EVIDENCE_ALLOWED_TYPES: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  txt: ['text/plain'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav', 'audio/x-wav'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
};

// EVD-006: the original filename is untrusted display text — no path
// separators, no reserved characters, no control characters, no dotfiles.
const FILENAME_REJECT = /[/\\<>:"|?*]/;
const hasControlChars = (name: string): boolean =>
  [...name].some((ch) => ch.charCodeAt(0) < 0x20);

export const evidenceFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((name) => !FILENAME_REJECT.test(name) && !hasControlChars(name), 'invalid filename')
  .refine((name) => !name.startsWith('.'), 'invalid filename');

export const evidenceUploadRequestSchema = z.object({
  category: evidenceCategorySchema,
  filename: evidenceFilenameSchema,
  mimeType: z.string().trim().min(3).max(100),
  sizeBytes: z.number().int().positive().max(MAX_EVIDENCE_FILE_BYTES),
});

export type EvidenceCategory = z.infer<typeof evidenceCategorySchema>;
export type EvidenceUploadRequest = z.infer<typeof evidenceUploadRequestSchema>;
