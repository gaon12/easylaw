import { desc, eq, lt } from "drizzle-orm";
import type { AppDb } from "../client";
import { type ERROR_EVENT_SOURCES, errorEvent } from "./schema";

type ErrorEventSource = (typeof ERROR_EVENT_SOURCES)[number];

interface NewErrorEvent {
  readonly publicCode: string;
  readonly digest: string | null;
  readonly source: ErrorEventSource;
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly requestPath: string | null;
  readonly method: string | null;
  readonly routePath: string | null;
  readonly routeType: string | null;
}

const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const RETENTION_MS = RETENTION_DAYS * DAY_MS;

function createErrorEvent(db: AppDb, input: NewErrorEvent): string {
  const id = crypto.randomUUID();
  db.insert(errorEvent)
    .values({ id, ...input })
    .run();
  db.delete(errorEvent)
    .where(lt(errorEvent.createdAt, new Date(Date.now() - RETENTION_MS)))
    .run();
  return id;
}

function listErrorEvents(db: AppDb, input: { publicCode?: string; limit: number }) {
  const query = db
    .select({
      id: errorEvent.id,
      publicCode: errorEvent.publicCode,
      digest: errorEvent.digest,
      source: errorEvent.source,
      name: errorEvent.name,
      message: errorEvent.message,
      stack: errorEvent.stack,
      requestPath: errorEvent.requestPath,
      method: errorEvent.method,
      routePath: errorEvent.routePath,
      routeType: errorEvent.routeType,
      createdAt: errorEvent.createdAt,
    })
    .from(errorEvent)
    .orderBy(desc(errorEvent.createdAt))
    .limit(input.limit);

  return input.publicCode === undefined
    ? query.all()
    : query.where(eq(errorEvent.publicCode, input.publicCode)).all();
}

export { createErrorEvent, listErrorEvents };
export type { ErrorEventSource, NewErrorEvent };
