import { z } from 'zod';

// INT-002: consumer auth is email + one-time code; the email is the durable
// consumer key, so it is normalized here once for every consumer of it.
export const normalizedEmailSchema = z.string().trim().toLowerCase().email().max(254);

// INT-008: the Turnstile token is required on the unauthenticated entry point.
export const authStartSchema = z.object({
  email: normalizedEmailSchema,
  turnstileToken: z.string().min(1).max(2048),
});

export const authVerifySchema = z.object({
  email: normalizedEmailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'expected a 6-digit code'),
});

export type AuthStart = z.infer<typeof authStartSchema>;
export type AuthVerify = z.infer<typeof authVerifySchema>;
