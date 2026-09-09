import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { LegalDb } from "@/db/client";
import { legalResourceDetail, legalResourceDetailRevision } from "./schema";

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

export { listLegalDetailRevisions, readLegalDetailRevision, saveLegalDetailRevision };
export type { SaveLegalDetailInput, SaveLegalDetailResult };
