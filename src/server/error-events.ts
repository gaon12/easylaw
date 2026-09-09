import "server-only";

import { createErrorEvent } from "@/db/app/error-events";
import { appDb } from "@/db/client";
import { publicErrorCode } from "@/lib/error-code";

const LIMITS = {
  name: 100,
  message: 2000,
  stack: 12_000,
  path: 1000,
  digest: 200,
  method: 12,
  routeType: 40,
} as const;
const QUERY_OR_FRAGMENT = /[?#]/;

function clipped(value: string | null | undefined, limit: number): string | null {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }
  return value.slice(0, limit);
}

function pathWithoutQuery(value: string | null | undefined): string | null {
  const path = clipped(value, LIMITS.path);
  return path?.split(QUERY_OR_FRAGMENT, 1)[0] ?? null;
}

function errorParts(error: unknown) {
  if (error instanceof Error) {
    const digest = "digest" in error ? clipped(String(error.digest), LIMITS.digest) : null;
    return {
      digest,
      name: clipped(error.name, LIMITS.name) ?? "Error",
      message: clipped(error.message, LIMITS.message) ?? "알 수 없는 오류",
      stack: clipped(error.stack, LIMITS.stack),
    };
  }
  return {
    digest: null,
    name: "ThrownValue",
    message: clipped(String(error), LIMITS.message) ?? "알 수 없는 오류",
    stack: null,
  };
}

function recordServerError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): string {
  const parts = errorParts(error);
  const fingerprint = parts.digest ?? `${parts.name}\n${parts.message}\n${parts.stack ?? ""}`;
  const publicCode = publicErrorCode(fingerprint);
  createErrorEvent(appDb(), {
    publicCode,
    digest: parts.digest,
    source: "server",
    name: parts.name,
    message: parts.message,
    stack: parts.stack,
    requestPath: pathWithoutQuery(request.path),
    method: clipped(request.method, LIMITS.method),
    routePath: pathWithoutQuery(context.routePath),
    routeType: clipped(context.routeType, LIMITS.routeType),
  });
  return publicCode;
}

function recordBrowserError(input: {
  digest?: string;
  name: string;
  message: string;
  stack?: string;
  path?: string;
}): string {
  const digest = clipped(input.digest, LIMITS.digest);
  const name = clipped(input.name, LIMITS.name) ?? "Error";
  const message = clipped(input.message, LIMITS.message) ?? "알 수 없는 오류";
  const stack = clipped(input.stack, LIMITS.stack);
  const fingerprint = digest ?? `${name}\n${message}\n${stack ?? ""}`;
  const publicCode = publicErrorCode(fingerprint);
  createErrorEvent(appDb(), {
    publicCode,
    digest,
    source: "browser",
    name,
    message,
    stack,
    requestPath: pathWithoutQuery(input.path),
    method: null,
    routePath: null,
    routeType: "boundary",
  });
  return publicCode;
}

export { recordBrowserError, recordServerError };
