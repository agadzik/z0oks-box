/**
 * Sandbox timeout configuration.
 * All timeout values are in milliseconds.
 */

/** SDK safety buffer reserved for sandbox before-stop hooks (30 seconds) */
const VERCEL_SANDBOX_TIMEOUT_BUFFER_MS = 30 * 1000;

/**
 * Vercel Sandbox API plan-dependent maximum sandbox lifetime.
 * - Hobby: 45 minutes (2_700_000 ms). Requesting more returns HTTP 402.
 * - Pro/Enterprise: 5 hours (18_000_000 ms).
 *
 * Default to the Hobby-compatible cap so deployments don't fail with
 * "Status code 402 is not ok" out of the box. Pro/Enterprise deployments
 * can opt into the 5-hour cap by setting `VERCEL_SANDBOX_TIMEOUT_MS`.
 */
const HOBBY_SANDBOX_MAX_TIMEOUT_MS = 45 * 60 * 1000;

function parseEnvTimeoutMs(): number | undefined {
  const raw = process.env.VERCEL_SANDBOX_TIMEOUT_MS;
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

/**
 * Default timeout for new cloud sandboxes.
 * Override via `VERCEL_SANDBOX_TIMEOUT_MS` env var (e.g. set to
 * `17970000` on Pro/Enterprise to use the 5-hour cap).
 */
export const DEFAULT_SANDBOX_TIMEOUT_MS =
  (parseEnvTimeoutMs() ?? HOBBY_SANDBOX_MAX_TIMEOUT_MS) -
  VERCEL_SANDBOX_TIMEOUT_BUFFER_MS;

/** Manual extension duration for explicit fallback flows (20 minutes) */
export const EXTEND_TIMEOUT_DURATION_MS = 20 * 60 * 1000;

/** Inactivity window before lifecycle hibernates an idle sandbox (30 minutes) */
export const SANDBOX_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

/** Buffer for sandbox expiry checks (10 seconds) */
export const SANDBOX_EXPIRES_BUFFER_MS = 10 * 1000;

/** Grace window before treating a lifecycle run as stale (2 minutes) */
export const SANDBOX_LIFECYCLE_STALE_RUN_GRACE_MS = 2 * 60 * 1000;

/** Minimum sleep between lifecycle workflow loop iterations (5 seconds) */
export const SANDBOX_LIFECYCLE_MIN_SLEEP_MS = 5 * 1000;

/**
 * Default ports to expose from cloud sandboxes.
 * Limited to 5 ports. Covers the most common framework defaults
 * plus the built-in code editor:
 * - 3000: Next.js, Express, Remix
 * - 5173: Vite, SvelteKit
 * - 4321: Astro
 * - 8000: code-server (built-in editor)
 */
export const DEFAULT_SANDBOX_PORTS = [3000, 5173, 4321, 8000];
export const CODE_SERVER_PORT = 8000;

/** Default working directory for sandboxes, used for path display */
export const DEFAULT_WORKING_DIRECTORY = "/vercel/sandbox";

/**
 * Base snapshot for fresh cloud sandboxes.
 * - Current snapshot includes: bun + jq + agent-browser + chromium + code-server
 *   (layered onto a bare Vercel image via `bun run sandbox:snapshot-base`)
 */
export const DEFAULT_SANDBOX_BASE_SNAPSHOT_ID =
  process.env.VERCEL_SANDBOX_BASE_SNAPSHOT_ID ??
  // Previous snapshot (bun + jq): "snap_MQ0NqdLL5qEXiYusgWL3K0yaMmql"
  // Previous snapshot (bun + jq + agent-browser + chromium): "snap_C8tUFhwRXZky4MaFvTuwO7DH66wx"
  // Previous snapshot (bun + jq + agent-browser + chromium + code-server): "snap_EjsphVxi07bFKrfojljJdIS41KHT"
  // Previous snapshot (bare Vercel image): "snap_EtAZ952zRg1ZqZo4H3sbQGgSL6AI"
  // Current snapshot (bun + jq + agent-browser + chromium + code-server):
  "snap_or4T6FHjdJz0jz0ug33iDOio9VYg";
