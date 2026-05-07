/**
 * Create a new sandbox base snapshot from the currently configured snapshot.
 * Defaults (snapshot id, ports, timeouts) come from the web app sandbox config so
 * this matches production; `refreshBaseSnapshot` skips workspace git bootstrap
 * so the new image stays clone-ready (see `@open-agents/sandbox` snapshot-refresh).
 *
 * Usage:
 *   bun run scripts/vercel-refresh-base-snapshot.ts --command "apt-get update"
 *   bun run scripts/vercel-refresh-base-snapshot.ts --from snap_123 --command "apt-get install -y ripgrep"
 */

import {
  DEFAULT_BASE_SNAPSHOT_COMMAND_TIMEOUT_MS,
  refreshBaseSnapshot,
} from "@open-agents/sandbox/vercel";
import {
  DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
  DEFAULT_SANDBOX_PORTS,
} from "../apps/web/lib/sandbox/config";
import { formatError } from "./format-error";
import { loadEnvFile } from "./load-env";

const SANDBOX_BASE_SNAPSHOT_CONFIG_PATH = "apps/web/lib/sandbox/config.ts";
const ENV_FILE_PATH = "apps/web/.env.local";
// Vercel Sandbox API rejects timeout > 2_700_000 for non-persistent sandboxes
// (the kind this script creates). Subtract the 30s beforeStop buffer the SDK
// adds in `VercelSandbox.create` so the wire value stays under the cap.
const SANDBOX_API_MAX_TIMEOUT_MS = 2_700_000;
const SANDBOX_SDK_BUFFER_MS = 30_000;
const DEFAULT_SANDBOX_TIMEOUT_MS =
  SANDBOX_API_MAX_TIMEOUT_MS - SANDBOX_SDK_BUFFER_MS;

interface CliOptions {
  baseSnapshotId?: string;
  sandboxTimeoutMs?: number;
  commandTimeoutMs?: number;
  commands: string[];
}

interface HelpResult {
  help: true;
}

function printUsage() {
  console.log(`Usage:
  bun run sandbox:snapshot-base -- --command "apt-get update"
  bun run sandbox:snapshot-base -- --from snap_123 --command "apt-get install -y ripgrep"

Options:
  --from <snapshot-id>         Override the starting snapshot id
  --command <shell-command>    Command to run inside the sandbox. Repeat as needed.
  --sandbox-timeout-ms <ms>    Sandbox lifetime for the refresh run
  --command-timeout-ms <ms>    Timeout for each setup command (default: ${DEFAULT_BASE_SNAPSHOT_COMMAND_TIMEOUT_MS})
  --help                       Show this message

Current configured base snapshot:
  ${DEFAULT_SANDBOX_BASE_SNAPSHOT_ID}`);
}

function requireOptionValue(
  argv: string[],
  index: number,
  option: string,
): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

// Collapse newline-plus-indentation sequences (terminal soft-wraps in pasted
// commands) into a single space. A bare `\n` is left alone because it's a
// legitimate shell statement separator.
function normalizeCommand(command: string): string {
  return command.replace(/\r?\n[\t ]+/g, " ").trim();
}

function parsePositiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive number.`);
  }

  return parsed;
}

function parseArgs(argv: string[]): CliOptions | HelpResult {
  const commands: string[] = [];
  let baseSnapshotId: string | undefined;
  let sandboxTimeoutMs: number | undefined;
  let commandTimeoutMs: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.trim().length === 0) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--from") {
      baseSnapshotId = requireOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--command") {
      commands.push(normalizeCommand(requireOptionValue(argv, index, arg)));
      index += 1;
      continue;
    }

    if (arg === "--sandbox-timeout-ms") {
      sandboxTimeoutMs = parsePositiveNumber(
        requireOptionValue(argv, index, arg),
        arg,
      );
      index += 1;
      continue;
    }

    if (arg === "--command-timeout-ms") {
      commandTimeoutMs = parsePositiveNumber(
        requireOptionValue(argv, index, arg),
        arg,
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    baseSnapshotId,
    sandboxTimeoutMs,
    commandTimeoutMs,
    commands,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ("help" in parsed) {
    printUsage();
    return;
  }

  await loadEnvFile(ENV_FILE_PATH);

  const result = await refreshBaseSnapshot({
    baseSnapshotId: parsed.baseSnapshotId ?? DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
    commands: parsed.commands,
    sandboxTimeoutMs: parsed.sandboxTimeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS,
    commandTimeoutMs: parsed.commandTimeoutMs,
    ports: DEFAULT_SANDBOX_PORTS,
    log: (message) => console.log(message),
  });

  console.log("");
  console.log(`New snapshot id: ${result.snapshotId}`);
  console.log(`Started from snapshot: ${result.sourceSnapshotId}`);
  console.log(
    `Update ${SANDBOX_BASE_SNAPSHOT_CONFIG_PATH} to use: "${result.snapshotId}"`,
  );
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
