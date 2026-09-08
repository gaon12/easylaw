import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = resolve(process.cwd(), "drizzle/app");
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
    INSERT INTO user (id, email, password_hash, role)
    VALUES ('user-1', 'owner@example.com', 'hash', 'member');
    INSERT INTO upload (
      id, user_id, title, doc_hash, char_count, uploaded_at, masked_at
    ) VALUES ('upload-1', 'user-1', '판결문', 'masked-hash', 4, 1000, 2000);
    INSERT INTO upload_span (
      id, upload_id, para_idx, sent_idx, char_start, char_end, text
    ) VALUES ('span-1', 'upload-1', 0, 0, 0, 4, '원문');
    INSERT INTO upload_mask (upload_id, kind, count)
    VALUES ('upload-1', 'name', 1);
    INSERT INTO upload_structure_node (
      id, upload_id, kind, payload, order_idx, prompt_version
    ) VALUES ('node-1', 'upload-1', 'holding', '{}', 0, 'extract-v1');
    INSERT INTO upload_node_span (structure_node_id, span_id)
    VALUES ('node-1', 'span-1');
    INSERT INTO upload_rendition (
      id, upload_id, level, model, prompt_version
    ) VALUES ('rendition-1', 'upload-1', 'L4', 'model-1', 'pipeline-v1');
    INSERT INTO upload_generation_job (
      id, upload_id, level, prompt_version, status, attempts
    ) VALUES ('job-1', 'upload-1', 'L4', 'pipeline-v1', 'done', 1);
  `);
}

describe("업로드 원문판 마이그레이션", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = OFF");
  });

  afterEach(() => {
    db.close();
  });

  it("기존 마스킹 span·요약·파생물을 하나의 UUID legacy 판에 고정한다", () => {
    applyThrough(db, 10);
    seedLegacyRows(db);
    const migration = readdirSync(MIGRATIONS).find((file) => file.startsWith("0011_"));
    expect(migration).toBeDefined();
    runSql(db, migration as string);
    db.pragma("foreign_keys = ON");

    const revisionId = db
      .prepare("SELECT current_revision_id FROM upload WHERE id = 'upload-1'")
      .pluck()
      .get() as string;
    expect(revisionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(
      db.prepare("SELECT content_hash FROM upload_revision WHERE id = ?").pluck().get(revisionId),
    ).toBeNull();
    expect(db.prepare("SELECT revision_id FROM upload_span").pluck().get()).toBe(revisionId);
    expect(db.prepare("SELECT revision_id FROM upload_mask").pluck().get()).toBe(revisionId);

    for (const table of ["upload_structure_node", "upload_rendition", "upload_generation_job"]) {
      const row = db
        .prepare(`SELECT source_revision_id AS revisionId, prompt_version AS version FROM ${table}`)
        .get() as { revisionId: string; version: string };
      expect(row.revisionId).toBe(revisionId);
      expect(row.version.endsWith(`::source:${revisionId}`)).toBe(true);
    }
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });
});
