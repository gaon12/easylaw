/**
 * 사용자 문서 저장소.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 쿼리는 이 함수들 뒤에 둔다.
 *
 * **소유자 확인이 여기에 있다.** 문서를 읽는 함수는 예외 없이 `userId`를 받아 조건에 넣는다.
 * "조회한 다음 컴포넌트에서 주인을 비교"하는 방식은 언젠가 비교를 빠뜨린다.
 */

import { and, desc, eq, gt, isNotNull, lte } from "drizzle-orm";
import type { MaskKind } from "@/lib/text/mask";
import type { AppDb } from "../client";
import { auditLog, session, upload, uploadMask, uploadSpan, user } from "./schema";

interface SpanInput {
  paraIdx: number;
  sentIdx: number;
  charStart: number;
  charEnd: number;
  text: string;
}

interface UploadInput {
  userId: string;
  title: string;
  filename: string | null;
  docHash: string;
  charCount: number;
  caseNoCanonical: string | null;
  /** null이면 "직접 지울 때까지". */
  retentionUntil: Date | null;
  spans: readonly SpanInput[];
  /** 종류별 마스킹 건수. 가린 내용은 넘기지 않는다. */
  maskCounts: Readonly<Partial<Record<MaskKind, number>>>;
}

interface SaveResult {
  id: string;
  /** 같은 문서를 이미 올렸는가. 그러면 새로 만들지 않고 기존 문서를 돌려준다. */
  duplicate: boolean;
}

const newId = (): string => crypto.randomUUID();

/**
 * 계정을 만든다. 이미 그 이메일이 있으면 undefined.
 *
 * UNIQUE 위반 예외를 화면까지 올려 보내지 않는다 — 예외가 올라가면 "문제가 생겼어요"
 * 말고는 할 말이 없어지는데, 여기서는 "이미 가입된 이메일이에요"라고 말할 수 있다.
 *
 * 이메일은 소문자로 정규화된 값만 들어온다고 본다. 정규화는 부르는 쪽의 몫이다.
 */
function createUser(db: AppDb, email: string, passwordHash: string): string | undefined {
  return db.transaction((tx) => {
    const taken = tx.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
    if (taken !== undefined) {
      return;
    }

    const id = newId();
    tx.insert(user).values({ id, email, passwordHash, lastSeenAt: new Date() }).run();
    tx.insert(auditLog)
      .values({ id: newId(), actor: id, action: "user.signed_up", target: id })
      .run();
    return id;
  });
}

/** 이메일은 소문자로 정규화된 값만 들어온다고 본다. 정규화는 부르는 쪽의 몫이다. */
function findUserByEmail(db: AppDb, email: string) {
  return db.select().from(user).where(eq(user.email, email)).get();
}

function findUserById(db: AppDb, userId: string) {
  return db.select().from(user).where(eq(user.id, userId)).get();
}

function touchUser(db: AppDb, userId: string): void {
  db.update(user).set({ lastSeenAt: new Date() }).where(eq(user.id, userId)).run();
}

/**
 * 세션을 연다. 쿠키에 들어갈 토큰의 **해시만** 받는다.
 *
 * 사용자당 여러 개가 열릴 수 있다 — 기기마다 하나씩이다. 사용자 행에 토큰 하나를 두면
 * 다른 기기에서 로그인할 때마다 앞의 기기가 튕긴다.
 */
function createSession(db: AppDb, userId: string, tokenHash: string, expiresAt: Date): string {
  const id = newId();
  db.insert(session).values({ id, userId, tokenHash, expiresAt, lastSeenAt: new Date() }).run();
  return id;
}

/** 살아 있는 세션만 돌려준다. 만료 조건을 질의에 함께 건다 — 나중에 비교하면 빠뜨린다. */
function findLiveSession(db: AppDb, tokenHash: string, now: Date = new Date()) {
  return db
    .select()
    .from(session)
    .where(and(eq(session.tokenHash, tokenHash), gt(session.expiresAt, now)))
    .get();
}

/** 쓸 때마다 만료를 뒤로 민다. 매일 쓰는 사람이 갑자기 튕기지 않도록. */
function touchSession(db: AppDb, sessionId: string, expiresAt: Date): void {
  db.update(session)
    .set({ expiresAt, lastSeenAt: new Date() })
    .where(eq(session.id, sessionId))
    .run();
}

function deleteSession(db: AppDb, sessionId: string): void {
  db.delete(session).where(eq(session.id, sessionId)).run();
}

/** 비밀번호를 바꿨을 때처럼 모든 기기에서 내보내야 하는 경우. */
function deleteSessionsForUser(db: AppDb, userId: string): void {
  db.delete(session).where(eq(session.userId, userId)).run();
}

/** 만료된 세션을 치운다. 남겨 두면 테이블이 무한히 자란다. */
function deleteExpiredSessions(db: AppDb, now: Date = new Date()): number {
  return db.delete(session).where(lte(session.expiresAt, now)).run().changes;
}

/**
 * 문서 한 건을 저장한다. 문장과 마스킹 요약까지 **한 트랜잭션**에서 넣는다.
 *
 * 나눠 넣으면 중간에 실패했을 때 문장 없는 문서가 남고, 그 문서는 화면에서 빈 원문으로 보인다.
 */
function saveUpload(db: AppDb, input: UploadInput): SaveResult {
  const existing = db
    .select({ id: upload.id })
    .from(upload)
    .where(and(eq(upload.userId, input.userId), eq(upload.docHash, input.docHash)))
    .get();
  if (existing !== undefined) {
    return { id: existing.id, duplicate: true };
  }

  const id = newId();
  db.transaction((tx) => {
    tx.insert(upload)
      .values({
        id,
        userId: input.userId,
        title: input.title,
        filename: input.filename,
        docHash: input.docHash,
        charCount: input.charCount,
        caseNoCanonical: input.caseNoCanonical,
        retentionUntil: input.retentionUntil,
        // 저장 시점에 이미 마스킹을 마친 본문만 들어온다.
        maskedAt: new Date(),
      })
      .run();

    if (input.spans.length > 0) {
      tx.insert(uploadSpan)
        .values(input.spans.map((span) => ({ id: newId(), uploadId: id, ...span })))
        .run();
    }

    const masks = Object.entries(input.maskCounts).filter(([, count]) => count > 0);
    if (masks.length > 0) {
      tx.insert(uploadMask)
        .values(masks.map(([kind, count]) => ({ uploadId: id, kind: kind as MaskKind, count })))
        .run();
    }

    tx.insert(auditLog)
      .values({
        id: newId(),
        actor: input.userId,
        action: "upload.created",
        target: id,
        // 내용이 아닌 사실만 남긴다.
        meta: { spans: input.spans.length, chars: input.charCount },
      })
      .run();
  });

  return { id, duplicate: false };
}

/** 주인이 아니면 undefined. "없음"과 "남의 것"을 구분하지 않는다 — 존재 여부도 정보다. */
function findUploadForOwner(db: AppDb, uploadId: string, userId: string) {
  return db
    .select()
    .from(upload)
    .where(and(eq(upload.id, uploadId), eq(upload.userId, userId)))
    .get();
}

function listUploadsForOwner(db: AppDb, userId: string) {
  return db
    .select()
    .from(upload)
    .where(eq(upload.userId, userId))
    .orderBy(desc(upload.uploadedAt))
    .all();
}

function listUploadSpans(db: AppDb, uploadId: string) {
  return db
    .select()
    .from(uploadSpan)
    .where(eq(uploadSpan.uploadId, uploadId))
    .orderBy(uploadSpan.paraIdx, uploadSpan.sentIdx)
    .all();
}

/** 무엇을 몇 건 가렸는지. 가린 내용은 저장하지 않으므로 종류와 수만 나온다. */
function listMaskCounts(db: AppDb, uploadId: string) {
  return db
    .select({ kind: uploadMask.kind, count: uploadMask.count })
    .from(uploadMask)
    .where(eq(uploadMask.uploadId, uploadId))
    .all();
}

/**
 * 문서를 지운다. 문장·마스킹 요약은 외래 키 `on delete cascade`가 함께 지운다.
 *
 * 지운 사실은 남긴다 — 되돌릴 수 없는 동작이므로 언제 무엇이 지워졌는지 답할 수 있어야 한다.
 * 남기는 것은 문서 **식별자**뿐이고 내용은 아니다.
 */
function deleteUpload(db: AppDb, uploadId: string, userId: string): boolean {
  return db.transaction((tx) => {
    const result = tx
      .delete(upload)
      .where(and(eq(upload.id, uploadId), eq(upload.userId, userId)))
      .run();

    if (result.changes === 0) {
      return false;
    }

    tx.insert(auditLog)
      .values({ id: newId(), actor: userId, action: "upload.deleted", target: uploadId })
      .run();
    return true;
  });
}

/**
 * 보관 기간이 지난 문서를 지운다.
 *
 * 사용자가 고른 기간은 약속이다. 지나도 남아 있으면 약속을 어긴 것이므로, 이 함수는
 * 조회 경로에서 주기적으로 불린다. 별도 스케줄러를 두지 않는 대신 호출을 싸게 유지한다
 * (`upload_retention_idx`가 이 조건을 받는다).
 */
function deleteExpiredUploads(db: AppDb, now: Date = new Date()): number {
  const expired = db
    .select({ id: upload.id, userId: upload.userId })
    .from(upload)
    .where(and(isNotNull(upload.retentionUntil), lte(upload.retentionUntil, now)))
    .all();

  if (expired.length === 0) {
    return 0;
  }

  db.transaction((tx) => {
    for (const row of expired) {
      tx.delete(upload).where(eq(upload.id, row.id)).run();
      tx.insert(auditLog)
        .values({ id: newId(), actor: row.userId, action: "upload.expired", target: row.id })
        .run();
    }
  });

  return expired.length;
}

export {
  createSession,
  deleteExpiredSessions,
  deleteExpiredUploads,
  deleteSession,
  deleteSessionsForUser,
  deleteUpload,
  findLiveSession,
  findUploadForOwner,
  createUser,
  findUserByEmail,
  findUserById,
  listMaskCounts,
  listUploadSpans,
  listUploadsForOwner,
  saveUpload,
  touchSession,
  touchUser,
};
export type { SaveResult, SpanInput, UploadInput };
