/**
 * Format an error for CLI output, surfacing extra fields from `@vercel/sandbox`'s
 * APIError (response status, parsed JSON body, sessionId, sandboxName) when present.
 */
export function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const parts: string[] = [error.message || error.name];
  const apiLike = error as Error & {
    response?: { status?: number; statusText?: string; url?: string };
    json?: unknown;
    text?: string;
    sessionId?: string;
    sandboxName?: string;
  };

  if (apiLike.response) {
    const { status, statusText, url } = apiLike.response;
    if (status || statusText || url) {
      parts.push(
        `HTTP ${status ?? "?"} ${statusText ?? ""}${url ? ` ${url}` : ""}`.trim(),
      );
    }
  }
  if (apiLike.json !== undefined) {
    parts.push(`response JSON: ${JSON.stringify(apiLike.json, null, 2)}`);
  } else if (apiLike.text) {
    parts.push(`response text: ${apiLike.text}`);
  }
  if (apiLike.sessionId) {
    parts.push(`sessionId: ${apiLike.sessionId}`);
  }
  if (apiLike.sandboxName) {
    parts.push(`sandboxName: ${apiLike.sandboxName}`);
  }
  return parts.join("\n");
}
