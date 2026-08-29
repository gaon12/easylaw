/**
 * 사용자 문서 스키마. `.dev/PRODUCT.md` §6.3
 *
 * 여기에는 **사용자가 올린 문서만** 들어간다. 공개 판례는 다른 데이터베이스(`corpus`)에 있고,
 * 두 파일은 조인하지 않는다. 나누는 이유는 성능이 아니라 안전이다 — 개인 판결문이
 * 공개 코퍼스로 새는 사고를 파일 단계에서 불가능하게 만든다(`PRODUCT.md` §6.1).
 *
 * 아직 만들지 않은 테이블이 있다. `upload_rendition`(설명본)은 LLM 파이프라인과 함께,
 * `share_link`(공유)는 공유 기능과 함께 넣는다. 쓰지 않는 빈 테이블을 미리 만들면
 * 검증되지 않은 스키마가 마이그레이션에 굳는다.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { MASK_KINDS } from "@/lib/text/mask";

/**
 * "지금" 기본값이 붙은 시각 컬럼. 컬럼 이름을 인자로 받는다 —
 * 이 DB에는 `uploaded_at`처럼 생성 시각이지만 이름이 다른 컬럼이 있고,
 * 이름을 코드가 정하는 것과 컬럼이 정하는 것이 어긋나면 마이그레이션을 읽을 수 없게 된다.
 */
const timestampNow = (name: string) =>
  integer(name, { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

/**
 * 문서의 주인.
 *
 * 로그인은 아직 없다. 첫 업로드 때 브라우저에 무작위 토큰을 쿠키로 주고, 여기에는
 * 그 토큰의 **해시만** 저장한다. DB가 유출돼도 토큰 자체는 복원되지 않는다.
 * 나중에 로그인을 붙이면 같은 행에 `email`이 채워지고 익명 문서가 그대로 이어진다.
 */
const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    /** 로그인 전에는 null이다. */
    email: text("email"),
    /** 소유 증명 토큰의 SHA-256. 원문 토큰은 저장하지 않는다. */
    ownerKeyHash: text("owner_key_hash").notNull(),
    /** 접근성 프로필 등 사용자 설정(JSON). */
    settings: text("settings", { mode: "json" }),
    createdAt: timestampNow("created_at"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    unique("user_owner_key_unique").on(table.ownerKeyHash),
    unique("user_email_unique").on(table.email),
  ],
);

/**
 * 올린 문서 한 건.
 *
 * **원문 전체를 그대로 보관하지 않는다.** 마스킹을 거친 문장(`upload_span`)만 남긴다.
 * 가리기 전 텍스트가 어딘가에 남아 있으면 마스킹은 장치가 아니라 장식이다.
 */
const upload = sqliteTable(
  "upload",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 사용자가 붙인 이름. 파일명이 없으면 서버가 날짜로 만든다. */
    title: text("title").notNull(),
    /** 원본 파일명. 붙여넣기로 들어온 경우 null. */
    filename: text("filename"),
    /** 마스킹된 본문의 SHA-256. 같은 문서를 두 번 올리는 것을 사용자별로 막는다. */
    docHash: text("doc_hash").notNull(),
    /** 마스킹 후 글자 수. 목록에서 분량을 보여 준다. */
    charCount: integer("char_count").notNull(),
    /** 사용자가 사건번호를 적었다면 보관한다. 공개 판례 연결에 쓴다. 검증하지 않는다. */
    caseNoCanonical: text("case_no_canonical"),
    uploadedAt: timestampNow("uploaded_at"),
    /** 마스킹을 마친 시각. null이면 아직 처리 전이다 — 그 상태로는 보여 주지 않는다. */
    maskedAt: integer("masked_at", { mode: "timestamp_ms" }),
    /**
     * 이 시각이 지나면 지운다. null이면 사용자가 "직접 지울 때까지"를 고른 것이다.
     * 기본값을 두지 않는다 — 보관 기간은 사용자가 고르는 것이지 서버가 정하는 것이 아니다.
     */
    retentionUntil: integer("retention_until", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("upload_user_idx").on(table.userId, table.uploadedAt),
    index("upload_retention_idx").on(table.retentionUntil),
    unique("upload_user_hash_unique").on(table.userId, table.docHash),
  ],
);

/**
 * 문장 단위 원문. `corpus`의 `judgment_span`과 **모양이 같다**.
 *
 * 같은 모양을 유지하는 이유는 변환 파이프라인과 뷰어를 양쪽에 그대로 쓰기 위해서다.
 * `char_start`/`char_end`는 **마스킹된** 본문 기준이다 — 마스킹이 글자 수를 바꾸므로
 * 가리기 전 좌표를 남기면 근거 하이라이트가 통째로 어긋난다.
 */
const uploadSpan = sqliteTable(
  "upload_span",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id")
      .notNull()
      .references(() => upload.id, { onDelete: "cascade" }),
    paraIdx: integer("para_idx").notNull(),
    sentIdx: integer("sent_idx").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    text: text("text").notNull(),
  },
  (table) => [index("upload_span_order_idx").on(table.uploadId, table.paraIdx, table.sentIdx)],
);

/**
 * 무엇을 몇 건 가렸는지.
 *
 * 가린 **내용**은 저장하지 않는다. 종류와 건수만 남긴다. 사용자가 자기 문서에서 무엇이
 * 가려졌는지 확인할 수 있어야 하지만(`PAGES.md` §17 `/settings/data`), 확인을 위해
 * 개인정보를 다시 보관하면 마스킹을 한 의미가 없다.
 */
const uploadMask = sqliteTable(
  "upload_mask",
  {
    uploadId: text("upload_id")
      .notNull()
      .references(() => upload.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MASK_KINDS }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [unique("upload_mask_unique").on(table.uploadId, table.kind)],
);

/**
 * 감사 로그.
 *
 * 삭제는 되돌릴 수 없으므로(`PAGES.md` §17) 언제 무엇이 지워졌는지는 남아야 한다.
 * 대상 행이 사라져도 남아야 하니 외래 키를 걸지 않는다. **문서 내용은 절대 넣지 않는다.**
 */
const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    /** 행위자 = user.id. 사용자가 지워진 뒤에도 기록은 남는다. */
    actor: text("actor"),
    action: text("action").notNull(),
    target: text("target"),
    at: timestampNow("at"),
    /** 내용이 아닌 사실만. 예: { "spans": 42 } */
    meta: text("meta", { mode: "json" }),
  },
  (table) => [index("audit_log_at_idx").on(table.at)],
);

/** drizzle 클라이언트에 넘길 스키마 묶음. 네임스페이스 import 대신 명시적으로 모은다. */
const appSchema = {
  auditLog,
  upload,
  uploadMask,
  uploadSpan,
  user,
};

export { appSchema, auditLog, upload, uploadMask, uploadSpan, user };
