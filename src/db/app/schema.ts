/**
 * 사용자 문서 스키마. `.dev/PRODUCT.md` §6.3
 *
 * 여기에는 **사용자가 올린 문서만** 들어간다. 공개 판례는 다른 데이터베이스(`corpus`)에 있고,
 * 두 파일은 조인하지 않는다. 나누는 이유는 성능이 아니라 안전이다 — 개인 판결문이
 * 공개 코퍼스로 새는 사고를 파일 단계에서 불가능하게 만든다(`PRODUCT.md` §6.1).
 *
 * **설명본 계열은 `corpus`와 모양이 같다**(§6.3). 구조 노드·근거 연결·변환본·문장·작업
 * 표가 이름만 `upload_`로 바뀐 채 그대로 있다. 같게 두는 것이 목적이다 — 파이프라인과
 * 뷰어가 저장소 인터페이스 하나로 양쪽을 쓰려면 모양이 어긋나면 안 된다.
 *
 * `share_link`(공유)는 아직 없다. 공유 기능과 함께 넣는다 — 쓰지 않는 빈 테이블을 미리
 * 만들면 검증되지 않은 스키마가 마이그레이션에 굳는다.
 */

import { sql } from "drizzle-orm";
// biome-ignore lint/suspicious/noDeprecatedImports: primaryKey의 가변인자 오버로드만 비권장이다. 우리는 권장형 primaryKey({ columns: [...] })를 쓴다.
import { index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
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
 * **가입하지 않아도 주인이 된다.** 첫 업로드 때 익명 사용자 행이 만들어지고,
 * 나중에 가입하면 그 행에 `email`과 `password_hash`가 채워진다. 새 사용자를 만들지
 * 않으므로 가입 전에 올린 문서가 그대로 따라온다 — 가입 때문에 문서를 잃으면
 * 아무도 가입하지 않는다.
 *
 * 이메일은 **소문자로 정규화해서** 저장한다. `A@b.com`과 `a@b.com`으로 각각 가입되면
 * 사용자는 둘 중 어느 것으로 가입했는지 알 수 없다.
 */
const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    /** 가입 전에는 null이다. 소문자로 정규화된 값만 들어온다. */
    email: text("email"),
    /** `scrypt$N$r$p$salt$hash`. 가입 전에는 null이다(`src/server/password.ts`). */
    passwordHash: text("password_hash"),
    /**
     * 화면에 보이는 이름.
     *
     * **이메일을 화면에 쓰지 않으려고 둔다.** 헤더에 이메일이 그대로 떠 있으면 화면을
     * 공유하거나 어깨너머로 볼 때 그대로 샌다. 이메일은 로그인에만 쓰고, 사람에게 보이는
     * 자리에는 이 이름을 쓴다.
     *
     * **유일하지 않다.** 같은 닉네임을 여럿이 쓸 수 있다 — 이것은 식별자가 아니라 호칭이고,
     * 유일하게 만들면 가입할 때 "이미 쓰는 사람이 있어요"를 만나게 된다. 계정을 가르는
     * 것은 이메일이다.
     *
     * 옛 계정에는 없을 수 있어 null을 허용한다. 없으면 화면이 이메일 앞부분을 쓴다.
     */
    nickname: text("nickname"),
    /**
     * 권한. `admin`은 설치 마법사가 만든 첫 계정이고, 서비스 설정을 바꿀 수 있다.
     * 컬럼 하나로 두는 이유는 지금 필요한 구분이 둘뿐이기 때문이다 —
     * 역할 테이블은 역할이 셋 이상 생길 때 만든다.
     */
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    /** 접근성 프로필 등 사용자 설정(JSON). */
    settings: text("settings", { mode: "json" }),
    createdAt: timestampNow("created_at"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  },
  (table) => [unique("user_email_unique").on(table.email)],
);

/**
 * 로그인 세션이자 익명 소유 증명.
 *
 * 쿠키에는 무작위 토큰이 들어가고 여기에는 그 토큰의 **SHA-256만** 저장한다.
 * DB가 유출돼도 남의 세션을 흉내 낼 수 없다.
 *
 * 사용자 행이 아니라 별도 테이블에 두는 이유는 **기기가 여럿이기 때문**이다.
 * 사용자 행에 토큰 한 개를 두면 다른 기기에서 로그인할 때마다 앞의 기기가 튕긴다.
 * 로그아웃도 이 행 하나를 지우는 일이 된다.
 */
const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 쿠키 토큰의 SHA-256. 원문 토큰은 저장하지 않는다. */
    tokenHash: text("token_hash").notNull(),
    /**
     * 이 시각이 지나면 쓸 수 없다. 쓸 때마다 뒤로 민다.
     * 익명 세션은 길게(문서 소유권이 걸려 있다), 로그인 세션은 짧게 잡는다.
     */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: timestampNow("created_at"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    unique("session_token_unique").on(table.tokenHash),
    index("session_user_idx").on(table.userId),
    index("session_expires_idx").on(table.expiresAt),
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
 * 서비스 설정.
 *
 * **환경변수 대신 여기에 둔다.** 환경변수는 값을 바꿀 때마다 서버를 다시 띄워야 하고,
 * 파일을 직접 고칠 수 있는 사람만 바꿀 수 있다. 자가 호스팅하는 사람이 화면에서
 * 법제처 키를 넣고 고칠 수 있어야 한다.
 *
 * 남는 것은 부팅에 반드시 필요한 값뿐이다 — 데이터베이스 경로는 이 표를 읽기 전에
 * 알아야 하므로 환경변수로 남는다.
 *
 * **비밀값을 평문으로 둔다.** 암호화하려면 그 열쇠를 다시 어딘가에 둬야 하고, 결국
 * 환경변수로 돌아간다. 그보다 중요한 사실은 이 데이터베이스에 이미 사용자의 판결문과
 * 비밀번호 해시가 들어 있다는 것이다 — API 키 하나가 더 들어간다고 보호 수준이 달라지지
 * 않는다. 이 파일은 비밀 파일로 다뤄야 하고, `.gitignore`가 이미 확장자로 막고 있다.
 * 대신 **화면에는 값을 되돌려 보여 주지 않는다**(설정됨/설정 안 됨만 보여 준다).
 */
const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestampNow("updated_at"),
  /** 누가 바꿨는지. 사용자가 지워져도 남아야 하니 외래 키를 걸지 않는다. */
  updatedBy: text("updated_by"),
});

/**
 * 아래 다섯 표는 `corpus`의 `structure_node`·`node_span`·`rendition`·`rendition_sentence`·
 * `generation_job`과 **같은 모양**이다(§6.3). 이름만 `upload_`가 붙고 부모가 `upload`다.
 *
 * 왜 같은 모양이어야 하나. 올린 판결문에도 같은 파이프라인이 돌기 때문이다 —
 * 추출한 구조가 원문 span에 매이고, 그 구조에서 레벨별 문장이 나오고, 문장이 자기가
 * 파생된 노드를 통해 원문으로 되짚어진다. 그 연결이 한쪽만 다르면 뷰어도 파이프라인도
 * 두 벌이 된다.
 *
 * **다른 점은 하나다.** 공개 판례의 설명본은 모두가 나눠 쓰지만(`PAGES.md` §5),
 * 올린 문서의 설명본은 그 사람만의 것이다. 그래서 캐시를 공유하지 않고, 문서가 지워지면
 * 설명본도 함께 지워진다(`on delete cascade`).
 */
const LEVELS = ["L1", "L2", "L3", "L4"] as const;
const CONFIDENCES = ["grounded", "needs_check", "ungrounded"] as const;
const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
const JOB_STAGES = ["structure", "render", "verify", "save"] as const;

const uploadStructureNode = sqliteTable(
  "upload_structure_node",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id")
      .notNull()
      .references(() => upload.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["fact_event", "issue", "claim", "holding", "conclusion", "citation"],
    }).notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    occurredOn: integer("occurred_on", { mode: "timestamp_ms" }),
    orderIdx: integer("order_idx").notNull(),
    /**
     * 어느 추출 프롬프트가 뽑은 구조인가.
     *
     * **프롬프트를 고치면 옛 구조가 그대로 쓰이는 것을 막는다.** 지시문을 고치는 이유는
     * 앞선 판이 잘못 뽑았기 때문인데, 이 열이 없으면 이미 처리한 문서는 영영 옛 결과를
     * 쓴다 — 고친 보람이 없다.
     *
     * **옛 노드를 지우지 않는다.** 그 id로 만들어진 옛 설명이 남아 있고(§6.4 — 기존
     * 변환본은 지우지 않는다), 지우면 그 설명의 근거 링크가 끊긴다. 판이 다르면 나란히
     * 둔다. 읽는 쪽이 자기 판만 골라 본다.
     *
     * 기존 행은 `legacy`다 — 어느 판이었는지 알 수 없으므로 "지금 판이 아니다"로만 둔다.
     */
    promptVersion: text("prompt_version").notNull().default("legacy"),
  },
  (table) => [
    index("upload_structure_node_upload_idx").on(table.uploadId, table.orderIdx),
    index("upload_structure_node_version_idx").on(table.uploadId, table.promptVersion),
  ],
);

/** 구조 노드 ↔ 올린 문서의 원문 span (N:M). 근거 연결의 실체다. */
const uploadNodeSpan = sqliteTable(
  "upload_node_span",
  {
    structureNodeId: text("structure_node_id")
      .notNull()
      .references(() => uploadStructureNode.id, { onDelete: "cascade" }),
    spanId: text("span_id")
      .notNull()
      .references(() => uploadSpan.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.structureNodeId, table.spanId] }),
    index("upload_node_span_span_idx").on(table.spanId),
  ],
);

const uploadRendition = sqliteTable(
  "upload_rendition",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id")
      .notNull()
      .references(() => upload.id, { onDelete: "cascade" }),
    level: text("level", { enum: LEVELS }).notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    reviewState: text("review_state", { enum: ["none", "pending", "approved", "rejected"] })
      .notNull()
      .default("none"),
    generatedAt: timestampNow("generated_at"),
  },
  (table) => [
    unique("upload_rendition_variant_unique").on(table.uploadId, table.level, table.promptVersion),
    index("upload_rendition_lookup_idx").on(table.uploadId, table.level),
  ],
);

const uploadRenditionSentence = sqliteTable(
  "upload_rendition_sentence",
  {
    id: text("id").primaryKey(),
    renditionId: text("rendition_id")
      .notNull()
      .references(() => uploadRendition.id, { onDelete: "cascade" }),
    orderIdx: integer("order_idx").notNull(),
    role: text("role", { enum: ["heading", "body"] })
      .notNull()
      .default("body"),
    text: text("text").notNull(),
    structureNodeId: text("structure_node_id").references(() => uploadStructureNode.id, {
      onDelete: "set null",
    }),
    confidence: text("confidence", { enum: CONFIDENCES }).notNull(),
    checkReason: text("check_reason"),
  },
  (table) => [
    unique("upload_rendition_sentence_order_unique").on(table.renditionId, table.orderIdx),
    index("upload_rendition_sentence_rendition_idx").on(table.renditionId),
  ],
);

/**
 * 올린 문서의 생성 작업.
 *
 * 공개 판례와 달리 **동시 요청이 겹칠 일이 거의 없다**(문서 주인 한 사람만 연다).
 * 그래도 같은 표를 두는 이유는 두 가지다 — 좀비 작업 회수와 진행 표시(§5.3)가
 * 이 표를 읽고, 무엇보다 파이프라인이 양쪽에 같은 코드를 쓰기 때문이다.
 */
const uploadGenerationJob = sqliteTable(
  "upload_generation_job",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id")
      .notNull()
      .references(() => upload.id, { onDelete: "cascade" }),
    level: text("level", { enum: LEVELS }).notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("queued"),
    stage: text("stage", { enum: JOB_STAGES }),
    claimedBy: text("claimed_by"),
    heartbeatAt: integer("heartbeat_at", { mode: "timestamp_ms" }),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestampNow("created_at"),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    unique("upload_generation_job_variant_unique").on(
      table.uploadId,
      table.level,
      table.promptVersion,
    ),
    index("upload_generation_job_status_idx").on(table.status, table.heartbeatAt),
  ],
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
  session,
  setting,
  upload,
  uploadGenerationJob,
  uploadMask,
  uploadNodeSpan,
  uploadRendition,
  uploadRenditionSentence,
  uploadSpan,
  uploadStructureNode,
  user,
};

export {
  appSchema,
  auditLog,
  CONFIDENCES,
  JOB_STAGES,
  JOB_STATUSES,
  LEVELS,
  session,
  setting,
  upload,
  uploadGenerationJob,
  uploadMask,
  uploadNodeSpan,
  uploadRendition,
  uploadRenditionSentence,
  uploadSpan,
  uploadStructureNode,
  user,
};
