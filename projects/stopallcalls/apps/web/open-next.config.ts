import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Defaults: static assets served from the Workers assets binding, no
// incremental cache (the app is fully dynamic; add the R2 incremental cache
// only if ISR is ever introduced).
export default defineCloudflareConfig();
