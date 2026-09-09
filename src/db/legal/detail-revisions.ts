import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { LegalDb } from "@/db/client";
import { legalResource, legalResourceDetail, legalResourceDetailRevision } from "./schema";

interface SaveLegalDetailInput {
  source: string;
  detailKey: string;
  payload: Buffer;
  payloadHash: string;
  listPayloadHash: string;
  originalBytes: number;
  storedBytes: number;
  fetchedAt: Date;
}

interface SaveLegalDetailResult {
  status: "added" | "changed" | "unchanged";
  detailId: string;
  revisionId: string;
}

interface ExistingDetail {
  id: string;
  payload: Buffer;
  payloadHash: string;
  listPayloadHash: string;
  originalBytes: number;
  storedBytes: number;
  fetchedAt: Date;
  currentRevisionId: string | null;
}

function revisionValues(input: SaveLegalDetailInput, payload: Buffer | null) {
  return {
    payload,
    payloadHash: input.payloadHash,
    listPayloadHash: input.listPayloadHash,
    originalBytes: input.originalBytes,
    storedBytes: input.storedBytes,
    fetchedAt: input.fetchedAt,
  };
}

function revisionIdFor(db: LegalDb, existing: ExistingDetail): string {
  return (
    existing.currentRevisionId ??
    db
      .select({ id: legalResourceDetailRevision.id })
      .from(legalResourceDetailRevision)
      .where(
        and(
          eq(legalResourceDetailRevision.detailId, existing.id),
          eq(legalResourceDetailRevision.payloadHash, existing.payloadHash),
        ),
      )
      .get()?.id ??
    randomUUID()
  );
}

function saveUnchangedRevision(
  db: LegalDb,
  input: SaveLegalDetailInput,
  existing: ExistingDetail,
): SaveLegalDetailResult {
  const revisionId = revisionIdFor(db, existing);
  db.transaction((tx) => {
    tx.insert(legalResourceDetailRevision)
      .values({ id: revisionId, detailId: existing.id, ...revisionValues(input, null) })
      .onConflictDoNothing()
      .run();
    tx.update(legalResourceDetail)
      .set({ ...input, currentRevisionId: revisionId })
      .where(eq(legalResourceDetail.id, existing.id))
      .run();
  });
  return { status: "unchanged", detailId: existing.id, revisionId };
}

function saveChangedRevision(
  db: LegalDb,
  input: SaveLegalDetailInput,
  existing: ExistingDetail | undefined,
): SaveLegalDetailResult {
  const detailId = existing?.id ?? randomUUID();
  const revisionId = randomUUID();
  const previousRevisionId = existing === undefined ? undefined : revisionIdFor(db, existing);
  db.transaction((tx) => {
    if (existing === undefined) {
      tx.insert(legalResourceDetail)
        .values({ id: detailId, ...input, currentRevisionId: revisionId })
        .run();
    } else {
      tx.insert(legalResourceDetailRevision)
        .values({
          id: previousRevisionId ?? randomUUID(),
          detailId,
          payload: existing.payload,
          payloadHash: existing.payloadHash,
          listPayloadHash: existing.listPayloadHash,
          originalBytes: existing.originalBytes,
          storedBytes: existing.storedBytes,
          fetchedAt: existing.fetchedAt,
        })
        .onConflictDoUpdate({
          target: [legalResourceDetailRevision.detailId, legalResourceDetailRevision.payloadHash],
          set: { payload: existing.payload },
        })
        .run();
      tx.update(legalResourceDetail)
        .set({ ...input, currentRevisionId: revisionId })
        .where(eq(legalResourceDetail.id, detailId))
        .run();
    }
    tx.insert(legalResourceDetailRevision)
      .values({ id: revisionId, detailId, ...revisionValues(input, null) })
      .run();
  });
  return {
    status: existing === undefined ? "added" : "changed",
    detailId,
    revisionId,
  };
}

/**
 * 최신 조회 행과 불변 본문판을 한 트랜잭션에서 함께 저장한다.
 *
 * 목록 메타데이터만 달라지고 상세 본문 해시가 같으면 새 판을 만들지 않는다. 현재 행의
 * 목록 해시와 확인 시각만 갱신해 다음 동기화가 다시 내려받지 않게 한다.
 */
function saveLegalDetailRevision(db: LegalDb, input: SaveLegalDetailInput): SaveLegalDetailResult {
  const existing = db
    .select({
      id: legalResourceDetail.id,
      payload: legalResourceDetail.payload,
      payloadHash: legalResourceDetail.payloadHash,
      listPayloadHash: legalResourceDetail.listPayloadHash,
      originalBytes: legalResourceDetail.originalBytes,
      storedBytes: legalResourceDetail.storedBytes,
      fetchedAt: legalResourceDetail.fetchedAt,
      currentRevisionId: legalResourceDetail.currentRevisionId,
    })
    .from(legalResourceDetail)
    .where(
      and(
        eq(legalResourceDetail.source, input.source),
        eq(legalResourceDetail.detailKey, input.detailKey),
      ),
    )
    .get();
  if (existing !== undefined && existing.payloadHash === input.payloadHash) {
    return saveUnchangedRevision(db, input, existing);
  }
  return saveChangedRevision(db, input, existing);
}

function listLegalDetailRevisions(db: LegalDb, source: string, detailKey: string) {
  return db
    .select({
      id: legalResourceDetailRevision.id,
      payloadHash: legalResourceDetailRevision.payloadHash,
      listPayloadHash: legalResourceDetailRevision.listPayloadHash,
      originalBytes: legalResourceDetailRevision.originalBytes,
      storedBytes: legalResourceDetailRevision.storedBytes,
      fetchedAt: legalResourceDetailRevision.fetchedAt,
      currentRevisionId: legalResourceDetail.currentRevisionId,
    })
    .from(legalResourceDetailRevision)
    .innerJoin(
      legalResourceDetail,
      eq(legalResourceDetailRevision.detailId, legalResourceDetail.id),
    )
    .where(
      and(eq(legalResourceDetail.source, source), eq(legalResourceDetail.detailKey, detailKey)),
    )
    .orderBy(desc(legalResourceDetailRevision.fetchedAt))
    .all()
    .map((row) => ({ ...row, isCurrent: row.id === row.currentRevisionId }));
}

/** 자료군 화면에서 최근 상세와 보존한 판 수를 함께 보여 준다. */
function listLegalDetailOverview(db: LegalDb, source: string, limit = 100) {
  const details = db
    .select({
      id: legalResourceDetail.id,
      detailKey: legalResourceDetail.detailKey,
      payloadHash: legalResourceDetail.payloadHash,
      currentRevisionId: legalResourceDetail.currentRevisionId,
      originalBytes: legalResourceDetail.originalBytes,
      storedBytes: legalResourceDetail.storedBytes,
      fetchedAt: legalResourceDetail.fetchedAt,
    })
    .from(legalResourceDetail)
    .where(eq(legalResourceDetail.source, source))
    .orderBy(desc(legalResourceDetail.fetchedAt))
    .limit(limit)
    .all();
  if (details.length === 0) {
    return [];
  }
  const detailIds = details.map((detail) => detail.id);
  const detailKeys = details.map((detail) => detail.detailKey);
  const counts = new Map(
    db
      .select({
        detailId: legalResourceDetailRevision.detailId,
        count: sql<number>`count(*)`,
      })
      .from(legalResourceDetailRevision)
      .where(inArray(legalResourceDetailRevision.detailId, detailIds))
      .groupBy(legalResourceDetailRevision.detailId)
      .all()
      .map((row) => [row.detailId, row.count]),
  );
  const titles = new Map<string, string>();
  for (const row of db
    .select({ detailKey: legalResource.detailKey, title: legalResource.title })
    .from(legalResource)
    .where(and(eq(legalResource.source, source), inArray(legalResource.detailKey, detailKeys)))
    .all()) {
    if (row.detailKey !== null && !titles.has(row.detailKey)) {
      titles.set(row.detailKey, row.title);
    }
  }
  return details.map((detail) => ({
    ...detail,
    title: titles.get(detail.detailKey),
    revisions: counts.get(detail.id) ?? 0,
  }));
}

function findLegalDetailOverview(db: LegalDb, source: string, detailId: string) {
  const detail = db
    .select({
      id: legalResourceDetail.id,
      detailKey: legalResourceDetail.detailKey,
      payloadHash: legalResourceDetail.payloadHash,
      currentRevisionId: legalResourceDetail.currentRevisionId,
      originalBytes: legalResourceDetail.originalBytes,
      storedBytes: legalResourceDetail.storedBytes,
      fetchedAt: legalResourceDetail.fetchedAt,
    })
    .from(legalResourceDetail)
    .where(and(eq(legalResourceDetail.id, detailId), eq(legalResourceDetail.source, source)))
    .get();
  if (detail === undefined) {
    return;
  }
  const title = db
    .select({ title: legalResource.title })
    .from(legalResource)
    .where(and(eq(legalResource.source, source), eq(legalResource.detailKey, detail.detailKey)))
    .limit(1)
    .get()?.title;
  return { ...detail, title };
}

/** 현재판은 detail의 한 벌을 읽고, 과거판은 revision에 옮겨 둔 본문을 읽는다. */
function readLegalDetailRevision(db: LegalDb, revisionId: string): Buffer | undefined {
  const row = db
    .select({
      revisionPayload: legalResourceDetailRevision.payload,
      currentRevisionId: legalResourceDetail.currentRevisionId,
      currentPayload: legalResourceDetail.payload,
    })
    .from(legalResourceDetailRevision)
    .innerJoin(
      legalResourceDetail,
      eq(legalResourceDetailRevision.detailId, legalResourceDetail.id),
    )
    .where(eq(legalResourceDetailRevision.id, revisionId))
    .get();
  if (row === undefined) {
    return;
  }
  return (
    row.revisionPayload ?? (row.currentRevisionId === revisionId ? row.currentPayload : undefined)
  );
}

/** URL에서 받은 UUID가 요청한 자료군·상세에 실제로 속하는지 확인한 뒤 읽는다. */
function readLegalDetailRevisionForDetail(
  db: LegalDb,
  source: string,
  detailId: string,
  revisionId: string,
): Buffer | undefined {
  const row = db
    .select({
      revisionPayload: legalResourceDetailRevision.payload,
      currentRevisionId: legalResourceDetail.currentRevisionId,
      currentPayload: legalResourceDetail.payload,
    })
    .from(legalResourceDetailRevision)
    .innerJoin(
      legalResourceDetail,
      eq(legalResourceDetailRevision.detailId, legalResourceDetail.id),
    )
    .where(
      and(
        eq(legalResourceDetailRevision.id, revisionId),
        eq(legalResourceDetail.id, detailId),
        eq(legalResourceDetail.source, source),
      ),
    )
    .get();
  if (row === undefined) {
    return;
  }
  return (
    row.revisionPayload ?? (row.currentRevisionId === revisionId ? row.currentPayload : undefined)
  );
}

function readLegalDetailRevisionJsonForDetail(
  db: LegalDb,
  source: string,
  detailId: string,
  revisionId: string,
): unknown | undefined {
  const compressed = readLegalDetailRevisionForDetail(db, source, detailId, revisionId);
  return compressed === undefined ? undefined : JSON.parse(gunzipSync(compressed).toString("utf8"));
}

export {
  findLegalDetailOverview,
  listLegalDetailOverview,
  listLegalDetailRevisions,
  readLegalDetailRevision,
  readLegalDetailRevisionForDetail,
  readLegalDetailRevisionJsonForDetail,
  saveLegalDetailRevision,
};
export type { SaveLegalDetailInput, SaveLegalDetailResult };
