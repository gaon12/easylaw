/**
 * 사용자 문서 저장소.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 쿼리는 이 함수들 뒤에 둔다.
 *
 * **소유자 확인이 여기에 있다.** 문서를 읽는 함수는 예외 없이 `userId`를 받아 조건에 넣는다.
 * "조회한 다음 컴포넌트에서 주인을 비교"하는 방식은 언젠가 비교를 빠뜨린다.
 */

import { and, count, desc, eq, gt, inArray, isNotNull, lte, sum } from "drizzle-orm";
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

type UserRole = (typeof user.role.enumValues)[number];

const newId = (): string => crypto.randomUUID();

/** 관리자가 하나라도 있는가. 설치 마법사의 첫 단계를 다시 열지 말지 여기서 갈린다. */
function hasAdmin(db: AppDb): boolean {
  return db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).get() !== undefined;
}

/**
 * 계정을 만든다. 이미 그 이메일이 있으면 undefined.
 *
 * UNIQUE 위반 예외를 화면까지 올려 보내지 않는다 — 예외가 올라가면 "문제가 생겼어요"
 * 말고는 할 말이 없어지는데, 여기서는 "이미 가입된 이메일이에요"라고 말할 수 있다.
 *
 * 이메일은 소문자로 정규화된 값만 들어온다고 본다. 정규화는 부르는 쪽의 몫이다.
 */
interface NewUser {
  readonly email: string;
  readonly passwordHash: string;
  readonly role?: UserRole;
  /** 화면에 보이는 이름. 없으면 화면이 이메일 앞부분을 쓴다. */
  readonly nickname?: string | null;
}

function createUser(db: AppDb, input: NewUser): string | undefined {
  const { email, passwordHash } = input;
  const role = input.role ?? "member";
  const nickname = input.nickname ?? null;

  return db.transaction((tx) => {
    const taken = tx.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
    if (taken !== undefined) {
      return;
    }

    const id = newId();
    tx.insert(user)
      .values({ id, email, passwordHash, role, nickname, lastSeenAt: new Date() })
      .run();
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

/** 관리자 화면에 표시할 계정 목록. 비밀번호 해시는 반환하지 않는다. */
function listUsersForAdmin(db: AppDb) {
  return db
    .select({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .all();
}

type RoleChangeResult = "updated" | "not_found" | "forbidden" | "last_admin" | "unchanged";

/**
 * 관리자만 계정 권한을 바꾼다. 마지막 관리자 강등은 막아 설치·운영이 잠기지 않게 한다.
 * 모든 검사와 변경을 한 트랜잭션에 넣어 두 요청이 동시에 마지막 관리자를 없애지 못한다.
 */
function setUserRole(
  db: AppDb,
  actorId: string,
  targetId: string,
  role: UserRole,
): RoleChangeResult {
  return db.transaction((tx) => {
    const actor = tx.select({ role: user.role }).from(user).where(eq(user.id, actorId)).get();
    if (actor?.role !== "admin") {
      return "forbidden";
    }
    const target = tx.select({ role: user.role }).from(user).where(eq(user.id, targetId)).get();
    if (target === undefined) {
      return "not_found";
    }
    if (target.role === role) {
      return "unchanged";
    }
    if (target.role === "admin" && role === "member") {
      const admins = tx.select({ id: user.id }).from(user).where(eq(user.role, "admin")).all();
      if (admins.length <= 1) {
        return "last_admin";
      }
    }
    tx.update(user).set({ role }).where(eq(user.id, targetId)).run();
    tx.insert(auditLog)
      .values({
        id: newId(),
        actor: actorId,
        action: "user.role_changed",
        target: targetId,
        meta: { from: target.role, to: role },
      })
      .run();
    return "updated";
  });
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

/**
 * 닉네임을 바꾼다.
 *
 * 감사 로그를 함께 남긴다 — 화면에 보이는 이름이 바뀌는 일이라, 나중에 "누가 언제
 * 바꿨나"를 물을 수 있어야 한다. 옛 이름을 함께 적어 두면 되짚을 수 있다.
 *
 * 유일성을 보지 않는 이유는 `credentials.ts`에 적었다 — 이것은 호칭이지 식별자가 아니다.
 */
function updateNickname(db: AppDb, userId: string, nickname: string): void {
  db.transaction((tx) => {
    const before = tx
      .select({ nickname: user.nickname })
      .from(user)
      .where(eq(user.id, userId))
      .get();

    tx.update(user).set({ nickname }).where(eq(user.id, userId)).run();
    tx.insert(auditLog)
      .values({
        id: newId(),
        actor: userId,
        action: "user.nickname_changed",
        target: userId,
        meta: { from: before?.nickname ?? null, to: nickname },
      })
      .run();
  });
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
 * 이 사람의 자료가 얼마나 되는지. `PAGES.md` §17
 *
 * **문서마다 세지 않는다.** 목록을 돌면서 문장 수를 물으면 문서 수만큼 조회가 붙는다
 * (§10.2 N+1 금지). 집계 셋을 각각 한 번씩만 던진다.
 *
 * 세는 것은 **건수뿐이다** — 무엇을 가렸는지는 애초에 저장하지 않는다(`schema.ts`).
 */
function summarizeOwnerData(
  db: AppDb,
  userId: string,
): {
  docs: number;
  sentences: number;
  masks: number;
} {
  const mine = db.select({ id: upload.id }).from(upload).where(eq(upload.userId, userId));

  const sentences = db
    .select({ n: count() })
    .from(uploadSpan)
    .where(inArray(uploadSpan.uploadId, mine))
    .get();

  const masks = db
    .select({ n: sum(uploadMask.count) })
    .from(uploadMask)
    .where(inArray(uploadMask.uploadId, mine))
    .get();

  const docs = db.select({ n: count() }).from(upload).where(eq(upload.userId, userId)).get();

  return {
    docs: docs?.n ?? 0,
    sentences: sentences?.n ?? 0,
    // `sum`은 행이 없으면 null을 준다. 문자열로 오는 드라이버가 있어 Number로 맞춘다.
    masks: Number(masks?.n ?? 0),
  };
}

/**
 * 보관 기간을 바꾼다. `PAGES.md` §17
 *
 * 지금까지 보관 기간은 **올릴 때 한 번** 정하면 끝이었다. 7일로 올려 둔 사건이 길어지면
 * 다시 올리는 수밖에 없었는데, 다시 올리면 같은 문서라도 `uploaded_at`이 새로 찍힌다.
 *
 * `null`은 "직접 지울 때까지"다. 기간을 **줄이는 것도 허용한다** — 사용자가 자기 문서를
 * 더 빨리 지우겠다는 것을 막을 이유가 없다. 이미 지난 시각으로 줄이면 다음 조회 때
 * `deleteExpiredUploads`가 가져간다.
 */
function updateRetention(
  db: AppDb,
  uploadId: string,
  userId: string,
  retentionUntil: Date | null,
): boolean {
  const result = db
    .update(upload)
    .set({ retentionUntil })
    .where(and(eq(upload.id, uploadId), eq(upload.userId, userId)))
    .run();

  if (result.changes === 0) {
    return false;
  }

  db.insert(auditLog)
    .values({
      id: newId(),
      actor: userId,
      action: "upload.retention_changed",
      target: uploadId,
      // 사실만 남긴다. 문서 내용은 넣지 않는다.
      meta: { until: retentionUntil?.toISOString() ?? null },
    })
    .run();
  return true;
}

/**
 * 이 사람의 문서를 전부 지운다. `PAGES.md` §17
 *
 * 문서함에서 하나씩 지울 수 있지만, 스무 개를 지우려면 스무 번을 눌러야 했다.
 * 자기 자료를 치우는 일이 귀찮아서 미뤄지면 그것도 보관 기간이 길어지는 것이다.
 *
 * **기록은 문서마다 하나씩 남긴다.** "전부 지웠다" 한 줄만 남기면 나중에 특정 문서가
 * 언제 사라졌는지 답할 수 없다.
 */
function deleteAllUploads(db: AppDb, userId: string): number {
  return db.transaction((tx) => {
    const mine = tx.select({ id: upload.id }).from(upload).where(eq(upload.userId, userId)).all();

    for (const row of mine) {
      tx.delete(upload).where(eq(upload.id, row.id)).run();
      tx.insert(auditLog)
        .values({ id: newId(), actor: userId, action: "upload.deleted", target: row.id })
        .run();
    }

    return mine.length;
  });
}

/**
 * 계정을 지운다. `PAGES.md` §17
 *
 * 처리방침이 "계정 전체를 지우는 기능은 아직 준비 중"이라고 적어 두었던 자리다.
 * 자기 자료를 거두어 갈 방법이 없는 서비스는 그 자료를 맡길 이유도 없다.
 *
 * **문서·문장·마스킹 요약·세션은 외래 키 `on delete cascade`가 함께 가져간다**(`schema.ts`).
 * 여기서 지우는 것은 `user` 한 행이고, 나머지는 DB가 보증한다 — 지울 표를 코드가 하나씩
 * 세면 표가 늘어날 때 빠뜨린다.
 *
 * 남기는 것은 감사 기록뿐이다. `audit_log`는 일부러 외래 키를 걸지 않았고(`schema.ts`),
 * 거기 들어가는 것은 식별자와 건수이지 내용이 아니다.
 */
function deleteAccount(db: AppDb, userId: string): boolean {
  return db.transaction((tx) => {
    const uploads = tx
      .select({ id: upload.id })
      .from(upload)
      .where(eq(upload.userId, userId))
      .all();

    const result = tx.delete(user).where(eq(user.id, userId)).run();
    if (result.changes === 0) {
      return false;
    }

    tx.insert(auditLog)
      .values({
        id: newId(),
        actor: userId,
        action: "account.deleted",
        target: userId,
        meta: { uploads: uploads.length },
      })
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
  deleteAccount,
  deleteAllUploads,
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
  hasAdmin,
  listUsersForAdmin,
  listMaskCounts,
  listUploadSpans,
  listUploadsForOwner,
  saveUpload,
  summarizeOwnerData,
  touchSession,
  touchUser,
  updateNickname,
  updateRetention,
  setUserRole,
};
export type { RoleChangeResult, SaveResult, SpanInput, UploadInput, UserRole };
