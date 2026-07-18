import type { TurnstileAdapter } from './types';

// INT-008: real server-side verification against Cloudflare siteverify.
// Selected by the web app when TURNSTILE_SECRET_KEY is configured; the fake
// remains the default everywhere else (DEV-003).
export class CloudflareTurnstileAdapter implements TurnstileAdapter {
  constructor(
    private readonly secretKey: string,
    private readonly endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  ) {}

  async verify(input: { token: string; remoteIp?: string }): Promise<boolean> {
    const body = new URLSearchParams({ secret: this.secretKey, response: input.token });
    if (input.remoteIp && input.remoteIp !== 'unknown') body.set('remoteip', input.remoteIp);
    try {
      const res = await fetch(this.endpoint, { method: 'POST', body });
      if (!res.ok) return false;
      const result = (await res.json()) as { success: boolean };
      return result.success === true;
    } catch {
      // Fail closed: an unreachable verifier must not admit traffic.
      return false;
    }
  }
}
