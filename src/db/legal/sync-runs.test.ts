import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LegalDb } from "@/db/client";
import { legalSchema, legalSyncRun } from "./schema";
import { failInterruptedLegalSyncRuns, INTERRUPTED_DETAIL } from "./sync-runs";

describe("법령 동기화 중단 복구", () => {
  let raw: Database.Database;
  let db: LegalDb;

  beforeEach(() => {
    raw = new Database(":memory:");
    raw.exec(`CREATE TABLE legal_sync_run (
      id text PRIMARY KEY NOT NULL,
      source text NOT NULL,
      trigger text NOT NULL,
      status text NOT NULL,
      started_at integer NOT NULL,
      finished_at integer,
      received integer NOT NULL DEFAULT 0,
      added integer NOT NULL DEFAULT 0,
      changed integer NOT NULL DEFAULT 0,
      restored integer NOT NULL DEFAULT 0,
      missing integer NOT NULL DEFAULT 0,
      detail_received integer NOT NULL DEFAULT 0,
      detail_added integer NOT NULL DEFAULT 0,
      detail_changed integer NOT NULL DEFAULT 0,
      detail_failed integer NOT NULL DEFAULT 0,
      detail text
    )`);
    db = drizzle(raw, { schema: legalSchema });
  });

  afterEach(() => raw.close());

  it("모든 실행 중 행을 실패로 닫고 완료된 행은 보존한다", () => {
    const startedAt = new Date("2026-09-09T00:00:00Z");
    db.insert(legalSyncRun)
      .values([
        { id: "old-a", source: "ordin", trigger: "automatic", status: "running", startedAt },
        { id: "old-b", source: "licbyl", trigger: "manual", status: "running", startedAt },
        {
          id: "done",
          source: "trty",
          trigger: "manual",
          status: "done",
          startedAt,
          finishedAt: startedAt,
        },
      ])
      .run();

    const finishedAt = new Date("2026-09-09T01:00:00Z");
    expect(failInterruptedLegalSyncRuns(db, finishedAt)).toBe(2);
    expect(db.select().from(legalSyncRun).all()).toMatchObject([
      { id: "old-a", status: "failed", detail: INTERRUPTED_DETAIL, finishedAt },
      { id: "old-b", status: "failed", detail: INTERRUPTED_DETAIL, finishedAt },
      { id: "done", status: "done", detail: null, finishedAt: startedAt },
    ]);
  });
});
