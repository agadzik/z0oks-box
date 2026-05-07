/**
 * Bootstrap a brand-new sandbox base snapshot from a bare Vercel Sandbox image.
 * Unlike `vercel-refresh-base-snapshot.ts` (which forks an existing snapshot),
 * this creates a sandbox with no `baseSnapshotId` and no source, runs the
 * provided setup commands, and snapshots the result. Use this once to seed
 * `DEFAULT_SANDBOX_BASE_SNAPSHOT_ID`; use the refresh script for incremental
 * updates afterwards.
 *
 * Usage:
 *   bun run sandbox:snapshot-bootstrap -- \
 *     --command "apt-get update" \
 *     --command "apt-get install -y jq"
 */

import { connectSandbox } from "@open-agents/sandbox";
import { DEFAULT_SANDBOX_PORTS } from "../apps/web/lib/sandbox/config";
import { formatError } from "./format-error";
import { loadEnvFile } from "./load-env";

const SANDBOX_BASE_SNAPSHOT_CONFIG_PATH = "apps/web/lib/sandbox/config.ts";
const ENV_FILE_PATH = "apps/web/.env.local";
const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
// Vercel Sandbox API rejects timeout > 2_700_000. Subtract the 30s
// beforeStop buffer the SDK adds in `VercelSandbox.create` so the wire
// value stays under the cap.
const SANDBOX_API_MAX_TIMEOUT_MS = 2_700_000;
const SANDBOX_SDK_BUFFER_MS = 30_000;
const DEFAULT_SANDBOX_TIMEOUT_MS =
  SANDBOX_API_MAX_TIMEOUT_MS - SANDBOX_SDK_BUFFER_MS;

interface CliOptions {
  sandboxTimeoutMs?: number;
  commandTimeoutMs?: number;
  commands: string[];
}

interface HelpResult {
  help: true;
}

function printUsage() {
  console.log(`Usage:
  bun run sandbox:snapshot-bootstrap -- --command "apt-get update"
  bun run sandbox:snapshot-bootstrap -- --command "apt-get update" --command "apt-get install -y jq"

Options:
  --command <shell-command>    Command to run inside the bare sandbox. Repeat as needed.
  --sandbox-timeout-ms <ms>    Sandbox lifetime for the bootstrap run (default: ${DEFAULT_SANDBOX_TIMEOUT_MS})
  --command-timeout-ms <ms>    Timeout for each setup command (default: ${DEFAULT_COMMAND_TIMEOUT_MS})
  --help                       Show this message`);
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

  return { sandboxTimeoutMs, commandTimeoutMs, commands };
}

function formatOutput(label: string, output: string): string | null {
  const trimmed = output.trim();
  return trimmed ? `${label}:\n${trimmed}` : null;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ("help" in parsed) {
    printUsage();
    return;
  }

  await loadEnvFile(ENV_FILE_PATH);

  const commands = parsed.commands.filter((c) => c.trim().length > 0);
  const sandboxTimeoutMs =
    parsed.sandboxTimeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS;
  const commandTimeoutMs =
    parsed.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  console.log("Creating bare Vercel sandbox (no base snapshot, no source).");
  // `persistent: false` — bootstrap sandbox is throwaway.
  // `skipGitWorkspaceBootstrap: true` — keep `/vercel/sandbox` empty so the
  // resulting image is clone-ready for downstream agent sandboxes.
  const sandbox = await connectSandbox({
    state: { type: "vercel" },
    options: {
      timeout: sandboxTimeoutMs,
      ports: DEFAULT_SANDBOX_PORTS,
      persistent: false,
      skipGitWorkspaceBootstrap: true,
    },
  });

  let snapshotCreated = false;

  try {
    if (!sandbox.snapshot) {
      throw new Error(
        "Configured sandbox provider does not support snapshots.",
      );
    }

    for (const [index, command] of commands.entries()) {
      console.log(
        `Running command ${index + 1}/${commands.length}: ${command}`,
      );
      const result = await sandbox.exec(
        command,
        sandbox.workingDirectory,
        commandTimeoutMs,
      );

      if (!result.success) {
        const sections = [
          `Command failed while bootstrapping base snapshot: ${command}`,
          result.exitCode === null ? null : `Exit code: ${result.exitCode}`,
          formatOutput("stdout", result.stdout),
          formatOutput("stderr", result.stderr),
          result.truncated ? "Output was truncated." : null,
        ].filter((section): section is string => section !== null);
        throw new Error(sections.join("\n\n"));
      }
    }

    console.log("Creating snapshot from prepared sandbox.");
    const snapshot = await sandbox.snapshot();
    snapshotCreated = true;
    console.log(`Created snapshot ${snapshot.snapshotId}.`);

    console.log("");
    console.log(`New snapshot id: ${snapshot.snapshotId}`);
    console.log(
      `Update ${SANDBOX_BASE_SNAPSHOT_CONFIG_PATH} to use: "${snapshot.snapshotId}"`,
    );
  } finally {
    if (!snapshotCreated) {
      try {
        await sandbox.stop();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to stop sandbox after bootstrap attempt: ${message}`,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
