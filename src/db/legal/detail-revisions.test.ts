import { gzipSync } from "node:zlib";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LegalDb } from "@/db/client";
import {
  findLegalDetailOverview,
  listLegalDetailOverview,
  listLegalDetailRevisions,
  readLegalDetailRevision,
  readLegalDetailRevisionForDetail,
  readLegalDetailRevisionJsonForDetail,
  saveLegalDetailRevision,
} from "./detail-revisions";
import { checkLegalDetailRevision, findLegalRevisionCheck } from "./revision-checks";
import { legalResourceDetail, legalResourceDetailRevision, legalSchema } from "./schema";

describe("법령 상세 원문판", () => {
  let raw: Database.Database;
  let db: LegalDb;

  beforeEach(() => {
    raw = new Database(":memory:");
    raw.pragma("foreign_keys = ON");
    raw.exec(`CREATE TABLE legal_resource (
      id text PRIMARY KEY NOT NULL,
      source text NOT NULL,
      external_id text NOT NULL,
      title text NOT NULL,
      kind text,
      payload text NOT NULL,
      payload_hash text NOT NULL,
      detail_key text,
      first_seen_at integer NOT NULL,
      last_seen_at integer NOT NULL,
      missing_at integer,
      UNIQUE(source, external_id)
    );
    CREATE TABLE legal_resource_detail (
      id text PRIMARY KEY NOT NULL,
      source text NOT NULL,
      detail_key text NOT NULL,
      payload blob NOT NULL,
      payload_hash text NOT NULL,
      list_payload_hash text NOT NULL,
      encoding text DEFAULT 'gzip-json' NOT NULL,
      original_bytes integer NOT NULL,
      stored_bytes integer NOT NULL,
      fetched_at integer NOT NULL,
      current_revision_id text,
      UNIQUE(source, detail_key)
    );
    CREATE TABLE legal_resource_detail_revision (
      id text PRIMARY KEY NOT NULL,
      detail_id text NOT NULL REFERENCES legal_resource_detail(id) ON DELETE CASCADE,
      payload blob,
      payload_hash text NOT NULL,
      list_payload_hash text NOT NULL,
      encoding text DEFAULT 'gzip-json' NOT NULL,
      original_bytes integer NOT NULL,
      stored_bytes integer NOT NULL,
      fetched_at integer NOT NULL,
      UNIQUE(detail_id, payload_hash)
    );
    CREATE TABLE legal_detail_revision_check (
      revision_id text PRIMARY KEY NOT NULL REFERENCES legal_resource_detail_revision(id) ON DELETE CASCADE,
      baseline_revision_id text,
      state text NOT NULL,
      unchanged integer NOT NULL,
      changed integer NOT NULL,
      added integer NOT NULL,
      removed integer NOT NULL,
      issues text NOT NULL,
      checked_at integer NOT NULL
    )`);
    db = drizzle(raw, { schema: legalSchema });
  });

  afterEach(() => raw.close());

  function save(payloadHash: string, listPayloadHash: string, fetchedAt: string) {
    const payload = gzipSync(Buffer.from(JSON.stringify({ payloadHash })));
    return saveLegalDetailRevision(db, {
      source: "prec",
      detailKey: "123",
      payload,
      payloadHash,
      listPayloadHash,
      originalBytes: 100,
      storedBytes: payload.byteLength,
      fetchedAt: new Date(fetchedAt),
    });
  }

  it("본문이 바뀔 때만 새 불변판을 만들고 현재 포인터를 전환한다", () => {
    const first = save("hash-a", "list-a", "2026-09-09T00:00:00Z");
    expect(first.status).toBe("added");
    expect(
      checkLegalDetailRevision(db, {
        source: "prec",
        detailId: first.detailId,
        detailKey: "123",
        revisionId: first.revisionId,
      }),
    ).toMatchObject({ state: "passed" });

    const metadataOnly = save("hash-a", "list-b", "2026-09-09T01:00:00Z");
    expect(metadataOnly).toMatchObject({ status: "unchanged", revisionId: first.revisionId });
    expect(db.select().from(legalResourceDetailRevision).all()).toHaveLength(1);

    const changed = save("hash-b", "list-c", "2026-09-09T02:00:00Z");
    expect(changed.status).toBe("changed");
    expect(
      checkLegalDetailRevision(db, {
        source: "prec",
        detailId: changed.detailId,
        detailKey: "123",
        revisionId: changed.revisionId,
      }),
    ).toMatchObject({ state: "passed", changed: 1 });
    expect(findLegalRevisionCheck(db, changed.revisionId)).toMatchObject({
      baselineRevisionId: first.revisionId,
      state: "passed",
      changed: 1,
    });
    expect(db.select().from(legalResourceDetailRevision).all()).toMatchObject([
      { id: first.revisionId, payloadHash: "hash-a" },
      { id: changed.revisionId, payloadHash: "hash-b" },
    ]);
    const revisions = db.select().from(legalResourceDetailRevision).all();
    expect(revisions[0]?.payload).toEqual(
      gzipSync(Buffer.from(JSON.stringify({ payloadHash: "hash-a" }))),
    );
    expect(revisions[1]?.payload).toBeNull();
    expect(db.select().from(legalResourceDetail).get()).toMatchObject({
      id: first.detailId,
      payloadHash: "hash-b",
      listPayloadHash: "list-c",
      currentRevisionId: changed.revisionId,
    });
    expect(
      readLegalDetailRevisionJsonForDetail(db, "prec", first.detailId, first.revisionId),
    ).toEqual({ payloadHash: "hash-a" });
    expect(
      readLegalDetailRevisionJsonForDetail(db, "prec", first.detailId, changed.revisionId),
    ).toEqual({ payloadHash: "hash-b" });
    expect(
      readLegalDetailRevisionForDetail(db, "detc", first.detailId, first.revisionId),
    ).toBeUndefined();
    expect(readLegalDetailRevisionForDetail(db, "prec", "other", first.revisionId)).toBeUndefined();
    expect(readLegalDetailRevision(db, first.revisionId)).toEqual(revisions[0]?.payload);
    expect(readLegalDetailRevision(db, "missing")).toBeUndefined();
    expect(listLegalDetailRevisions(db, "prec", "123")).toMatchObject([
      { id: changed.revisionId, isCurrent: true },
      { id: first.revisionId, isCurrent: false },
    ]);

    raw
      .prepare(
        `INSERT INTO legal_resource
         (id, source, external_id, title, kind, payload, payload_hash, detail_key, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "resource-a",
        "prec",
        "external-a",
        "원문판 시험 자료",
        "판례",
        "{}",
        "list-c",
        "123",
        Date.now(),
        Date.now(),
      );
    expect(listLegalDetailOverview(db, "prec")).toMatchObject([
      { id: first.detailId, title: "원문판 시험 자료", revisions: 2 },
    ]);
    expect(findLegalDetailOverview(db, "prec", first.detailId)).toMatchObject({
      detailKey: "123",
      title: "원문판 시험 자료",
    });
    expect(findLegalDetailOverview(db, "detc", first.detailId)).toBeUndefined();
  });
});
