import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = resolve(process.cwd(), "drizzle/corpus");
const BREAKPOINT = /--> statement-breakpoint/gmu;

function runSql(db: Database.Database, file: string): void {
  db.exec(readFileSync(resolve(MIGRATIONS, file), "utf8").replace(BREAKPOINT, ""));
}

function applyThrough(db: Database.Database, lastIndex: number): void {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= lastIndex)
    .sort();
  for (const file of files) {
    runSql(db, file);
  }
}

function seedLegacyRows(db: Database.Database): void {
  db.exec(`
    INSERT INTO judgment (
      id, case_no_canonical, case_no_display, outcome, source, fetched_at, text_cached_at
    ) VALUES ('judgment-1', '2026다1', '2026다1', 'unknown', 'law_go_kr', 1000, 2000);
    INSERT INTO judgment_span (
      id, judgment_id, para_idx, sent_idx, char_start, char_end, text
    ) VALUES ('span-1', 'judgment-1', 0, 0, 0, 4, '원문이다');
    INSERT INTO structure_node (
      id, judgment_id, kind, payload, order_idx, prompt_version
    ) VALUES ('node-1', 'judgment-1', 'holding', '{}', 0, 'extract-v1');
    INSERT INTO node_span (structure_node_id, span_id) VALUES ('node-1', 'span-1');
    INSERT INTO rendition (
      id, judgment_id, level, model, prompt_version
    ) VALUES ('rendition-1', 'judgment-1', 'L4', 'model-1', 'pipeline-v1');
    INSERT INTO generation_job (
      id, judgment_id, level, prompt_version, status, attempts
    ) VALUES ('job-1', 'judgment-1', 'L4', 'pipeline-v1', 'done', 1);
  `);
}

describe("원문판 마이그레이션", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = OFF");
  });

  afterEach(() => {
    db.close();
  });

  it("기존 span과 파생물을 하나의 UUID legacy 판에 고정한다", () => {
    applyThrough(db, 12);
    seedLegacyRows(db);
    const revisionMigration = readdirSync(MIGRATIONS).find((file) => file.startsWith("0013_"));
    expect(revisionMigration).toBeDefined();
    runSql(db, revisionMigration as string);
    db.pragma("foreign_keys = ON");

    const judgment = db
      .prepare("SELECT current_revision_id AS revisionId FROM judgment WHERE id = 'judgment-1'")
      .get() as { revisionId: string };
    expect(judgment.revisionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    const revision = db
      .prepare("SELECT content_hash AS contentHash FROM judgment_revision WHERE id = ?")
      .get(judgment.revisionId) as { contentHash: string | null };
    expect(revision.contentHash).toBeNull();
    expect(
      db.prepare("SELECT revision_id FROM judgment_span WHERE id = 'span-1'").pluck().get(),
    ).toBe(judgment.revisionId);

    for (const table of ["structure_node", "rendition", "generation_job"]) {
      const row = db
        .prepare(`SELECT source_revision_id AS revisionId, prompt_version AS version FROM ${table}`)
        .get() as { revisionId: string; version: string };
      expect(row.revisionId).toBe(judgment.revisionId);
      expect(row.version.endsWith(`::source:${judgment.revisionId}`)).toBe(true);
    }
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });
});
