/**
 * 공개 코퍼스 스키마. `.dev/PRODUCT.md` §6.2
 *
 * 여기에는 **공개 판례만** 들어간다. 사용자가 올린 문서는 다른 데이터베이스(`app`)에 둔다.
 * 나누는 이유는 성능이 아니라 안전이다 — 한 테이블에 `is_public` 컬럼 하나로 두면
 * 언젠가 조건을 빠뜨린 쿼리가 개인 판결문을 공개 코퍼스로 흘려보낸다.
 */

import { sql } from "drizzle-orm";
// biome-ignore lint/suspicious/noDeprecatedImports: primaryKey의 가변인자 오버로드만 비권장이다. 우리는 권장형 primaryKey({ columns: [...] })를 쓴다.
import { index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

/** 판결 결과. "일부"를 숨기지 않으려고 별도 값으로 둔다(`PRODUCT.md` §4-A). */
const OUTCOMES = [
  "won",
  "partially_won",
  "lost",
  "dismissed_procedural",
  "criminal_guilty",
  "criminal_not_guilty",
  "criminal_appeal_dismissed",
  "unknown",
] as const;

/** 변환 레벨. L0(원문)은 생성물이 아니라 원문 그 자체라 여기 없다. */
const LEVELS = ["L1", "L2", "L3", "L4"] as const;

/** 신뢰도 3색. `ungrounded`는 렌더를 막고 재생성한다(`PRODUCT.md` §5.5 [7]). */
const CONFIDENCES = ["grounded", "needs_check", "ungrounded"] as const;

const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

const judgment = sqliteTable(
  "judgment",
  {
    id: text("id").primaryKey(),
    /** 조회 키. `src/lib/case-number`가 만든 정규형이다. */
    caseNoCanonical: text("case_no_canonical").notNull(),
    /** 화면에 되돌려 보여 줄 표기. */
    caseNoDisplay: text("case_no_display").notNull(),
    caseName: text("case_name"),
    court: text("court"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    caseType: text("case_type"),
    outcome: text("outcome", { enum: OUTCOMES }).notNull().default("unknown"),
    source: text("source", { enum: ["law_go_kr", "manual"] }).notNull(),
    /** 법제처 원문 링크. 출처 표시 의무([F-40])를 위해 항상 함께 보관한다. */
    sourceUrl: text("source_url"),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
    /** 원문 본문을 캐시한 시각. null이면 메타데이터만 있고 본문은 아직 없다. */
    textCachedAt: integer("text_cached_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("judgment_case_no_unique").on(table.caseNoCanonical),
    index("judgment_decided_at_idx").on(table.decidedAt),
  ],
);

/**
 * 원문 문장 하나. 모든 근거 연결이 이 행을 가리킨다.
 *
 * `charStart`/`charEnd`를 함께 보관해, 문장 분할 규칙이 바뀌어도 원문 위치를 되짚을 수 있다.
 */
const judgmentSpan = sqliteTable(
  "judgment_span",
  {
    id: text("id").primaryKey(),
    judgmentId: text("judgment_id")
      .notNull()
      .references(() => judgment.id, { onDelete: "cascade" }),
    paraIdx: integer("para_idx").notNull(),
    sentIdx: integer("sent_idx").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    unique("judgment_span_position_unique").on(table.judgmentId, table.paraIdx, table.sentIdx),
    index("judgment_span_judgment_idx").on(table.judgmentId),
  ],
);

const party = sqliteTable(
  "party",
  {
    id: text("id").primaryKey(),
    judgmentId: text("judgment_id")
      .notNull()
      .references(() => judgment.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["plaintiff", "defendant", "victim", "accused", "agency", "company", "other"],
    }).notNull(),
    displayName: text("display_name").notNull(),
  },
  (table) => [index("party_judgment_idx").on(table.judgmentId)],
);

/**
 * 구조화 추출 결과. 레벨별 문장은 원문이 아니라 **이 노드에서** 파생된다.
 * 그래야 모든 생성 문장이 노드를 통해 원문 span으로 되짚어진다(`PRODUCT.md` §5.5).
 */
const structureNode = sqliteTable(
  "structure_node",
  {
    id: text("id").primaryKey(),
    judgmentId: text("judgment_id")
      .notNull()
      .references(() => judgment.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["fact_event", "issue", "claim", "holding", "conclusion", "citation"],
    }).notNull(),
    /** 노드 종류마다 다른 필드. 스키마 검증은 애플리케이션에서 zod로 한다. */
    payload: text("payload", { mode: "json" }).notNull(),
    /** 사실 이벤트의 발생 시점. 알 수 없으면 null이고 화면에 "시점 불명"으로 표시한다. */
    occurredOn: integer("occurred_on", { mode: "timestamp_ms" }),
    orderIdx: integer("order_idx").notNull(),
  },
  (table) => [index("structure_node_judgment_idx").on(table.judgmentId, table.orderIdx)],
);

/** 구조 노드 ↔ 원문 span (N:M). 근거 연결의 실체다. */
const nodeSpan = sqliteTable(
  "node_span",
  {
    structureNodeId: text("structure_node_id")
      .notNull()
      .references(() => structureNode.id, { onDelete: "cascade" }),
    spanId: text("span_id")
      .notNull()
      .references(() => judgmentSpan.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.structureNodeId, table.spanId] }),
    index("node_span_span_idx").on(table.spanId),
  ],
);

/**
 * 레벨별 변환본.
 *
 * `(judgmentId, level, promptVersion)`이 유일하다 — 같은 조건이면 이미 만든 것을 쓴다.
 * 프롬프트를 고치면 promptVersion을 올리고, **기존 변환본은 지우지 않는다**(버전 비교·검수 이력).
 */
const rendition = sqliteTable(
  "rendition",
  {
    id: text("id").primaryKey(),
    judgmentId: text("judgment_id")
      .notNull()
      .references(() => judgment.id, { onDelete: "cascade" }),
    level: text("level", { enum: LEVELS }).notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    reviewState: text("review_state", { enum: ["none", "pending", "approved", "rejected"] })
      .notNull()
      .default("none"),
    generatedAt: createdAt(),
  },
  (table) => [
    unique("rendition_variant_unique").on(table.judgmentId, table.level, table.promptVersion),
    index("rendition_lookup_idx").on(table.judgmentId, table.level),
  ],
);

const renditionSentence = sqliteTable(
  "rendition_sentence",
  {
    id: text("id").primaryKey(),
    renditionId: text("rendition_id")
      .notNull()
      .references(() => rendition.id, { onDelete: "cascade" }),
    orderIdx: integer("order_idx").notNull(),
    /** 섹션 제목("그래서 어떻게 되나요")과 본문을 구분한다. */
    role: text("role", { enum: ["heading", "body"] })
      .notNull()
      .default("body"),
    text: text("text").notNull(),
    /** 이 문장이 파생된 구조 노드. 근거 추적의 출발점이다. */
    structureNodeId: text("structure_node_id").references(() => structureNode.id, {
      onDelete: "set null",
    }),
    confidence: text("confidence", { enum: CONFIDENCES }).notNull(),
    checkReason: text("check_reason"),
  },
  (table) => [
    unique("rendition_sentence_order_unique").on(table.renditionId, table.orderIdx),
    index("rendition_sentence_rendition_idx").on(table.renditionId),
  ],
);

/**
 * 법률용어 풀이.
 *
 * `genericDef`는 법제처 법령용어 API에서 채우는 것이 목표다([F-29]) — 생성이 아니라 공식 데이터다.
 * LLM은 `contextualDef`("이 판결에서의 뜻")만 만든다.
 */
const termGloss = sqliteTable(
  "term_gloss",
  {
    id: text("id").primaryKey(),
    judgmentId: text("judgment_id")
      .notNull()
      .references(() => judgment.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    genericDef: text("generic_def"),
    genericSource: text("generic_source"),
    contextualDef: text("contextual_def"),
    spanId: text("span_id").references(() => judgmentSpan.id, { onDelete: "set null" }),
  },
  (table) => [unique("term_gloss_unique").on(table.judgmentId, table.term)],
);

/**
 * 생성 작업. 중복 생성을 막는 자물쇠다(`PRODUCT.md` §5.3).
 *
 * `(judgmentId, level, promptVersion)` 유니크 제약 + `INSERT … ON CONFLICT DO NOTHING`으로
 * 작업을 선점한다. 선점에 실패한 요청은 새로 만들지 않고 이 행을 지켜본다.
 * `heartbeatAt`이 멈춘 작업은 회수한다 — 선점만 하고 죽은 작업이 캐시를 영구히 막는 것이 최악이다.
 */
const generationJob = sqliteTable(
  "generation_job",
  {
    id: text("id").primaryKey(),
    judgmentId: text("judgment_id")
      .notNull()
      .references(() => judgment.id, { onDelete: "cascade" }),
    level: text("level", { enum: LEVELS }).notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("queued"),
    claimedBy: text("claimed_by"),
    heartbeatAt: integer("heartbeat_at", { mode: "timestamp_ms" }),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    unique("generation_job_variant_unique").on(table.judgmentId, table.level, table.promptVersion),
    index("generation_job_status_idx").on(table.status, table.heartbeatAt),
  ],
);

/**
 * 하루에 몇 번 만들었나. `FEATURES.md` [F-42] · `PRODUCT.md` §7
 *
 * **작업 표를 세지 않고 따로 센다.** `generation_job`은 (판결문·레벨·프롬프트 판)마다
 * 한 행이고 재시도는 그 행을 되쓰기 때문에, 그 표로는 "오늘 몇 번 돌렸나"를 알 수 없다.
 * 지출은 행 수가 아니라 **돌린 횟수**에 붙는다.
 *
 * 날짜는 사이트 시간대 기준 `2026-09-04` 꼴 문자열이다(`lib/format.ts`의 `dayKey`).
 * 타임스탬프로 두고 범위로 세면 "오늘"이 서버 시간대에 따라 달라진다.
 */
const generationUsage = sqliteTable("generation_usage", {
  day: text("day").primaryKey(),
  count: integer("count").notNull().default(0),
});

/**
 * 조회했지만 없던 사건번호.
 *
 * 하급심 대부분은 공개되지 않아 이 경로가 예외가 아니라 주 경로다(`PRODUCT.md` §5.4).
 * 나중에 공개되면 알려 주는 기능([F-43])과 프리워밍([F-41])의 근거 데이터가 된다.
 */
const lookupMiss = sqliteTable(
  "lookup_miss",
  {
    caseNoCanonical: text("case_no_canonical").primaryKey(),
    count: integer("count").notNull().default(1),
    firstTriedAt: createdAt(),
    lastTriedAt: integer("last_tried_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("lookup_miss_last_tried_idx").on(table.lastTriedAt)],
);

/**
 * 법령의 **한 판(version)**. `PRODUCT.md` §6.4
 *
 * 판례는 요청할 때 만들지만 법령은 **미리 받아 둔다.** 이유는 두 가지다.
 *
 * 1. **과거 판이 필요하다.** 2019년 판결이 인용한 조문을 *현행* 법령으로 검증하면 틀린다.
 *    그 사이 개정됐으면 조문 번호가 밀렸거나 아예 없어졌을 수 있고, 그러면 실존하는
 *    인용을 "없는 조문"이라 하거나 반대로 엉뚱한 조문을 근거로 붙인다.
 * 2. **과거 판은 변하지 않는다.** 이미 시행이 끝난 법령의 그 시점 내용은 다시 바뀌지
 *    않으므로 영구 캐시해도 안전하다(§6.4).
 *
 * `lawId`(법령ID)는 법이 개정돼도 같고, `mst`(법령일련번호)가 공포된 판을 가리킨다.
 * 그래서 **"이 법의, 이 날짜에 시행 중이던 판"** 은 `(lawId, effectiveAt)` 인덱스 하나로
 * 찾는다 — 법제처에 묻지 않고 우리 DB에서 끝난다.
 *
 * ## `mst`는 유일하지 않다
 *
 * 한 번의 개정 안에서도 **조문마다 시행일이 다를 수 있다.** 그래서 법제처의 시행일법령
 * 목록은 같은 `mst`를 시행일만 바꿔 여러 번 준다 — 실제로 1쪽 500건 중 25건이 그랬다.
 * (예: `119구조ㆍ구급에 관한 법률` MST=228097은 2021-01-05 공포이고, 일부 조문은
 * 2021-07-06에, 나머지는 2022-01-06에 시행됐다.)
 *
 * 유일 제약을 `mst`에만 걸면 그 행들이 **조용히 버려진다.** 실제로 그렇게 짰다가
 * 1,500건 중 93건이 사라지는 것을 보고 고쳤다. 판 하나를 가리키는 것은
 * `(mst, effectiveAt)` 두 값이다.
 *
 * 본문(`lawArticle`)은 여기 없다. 판이 168,496개라 본문까지 전부 받으면 10GB를 넘고
 * 요청도 그만큼 나간다. **목록은 전부, 본문은 실제로 인용된 판만** 받는다.
 */
const lawVersion = sqliteTable(
  "law_version",
  {
    id: text("id").primaryKey(),
    /** 법령ID. 개정돼도 같은 값이라 "같은 법의 다른 판"을 묶는다. */
    lawId: text("law_id").notNull(),
    /** 법령일련번호(MST). 판 하나를 가리키는 조회 열쇠다. */
    mst: text("mst").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    /** 법률·대통령령·부령 등. */
    kind: text("kind"),
    ministry: text("ministry"),
    promulgatedAt: integer("promulgated_at", { mode: "timestamp_ms" }),
    /** 시행일. 시점 조회의 기준이다. */
    effectiveAt: integer("effective_at", { mode: "timestamp_ms" }),
    /** 현행인가 연혁인가. 법제처가 주는 구분을 그대로 둔다. */
    historyCode: text("history_code"),
    /** 본문을 받아 둔 시각. null이면 아직 목록만 있는 판이다. */
    bodyFetchedAt: integer("body_fetched_at", { mode: "timestamp_ms" }),
    /**
     * 장·절 제목. `[{ title, beforeArticleNo }]`.
     *
     * 목차의 뼈대다(`DESIGN.md` §11.5) — 조문이 519개인 법의 목차를 조문으로만 만들면
     * 그 자체가 또 하나의 긴 문서가 된다.
     *
     * 별도 표로 빼지 않는 이유는 **따로 조회할 일이 없기 때문**이다. 언제나 그 판의
     * 본문과 함께 읽고, 수도 몇십 개뿐이다. 본문이 없는 판에서는 null이다.
     */
    sections: text("sections", { mode: "json" }),
    fetchedAt: createdAt(),
  },
  (table) => [
    // mst 하나로는 유일하지 않다 — 위 설명 참조.
    unique("law_version_mst_effective_unique").on(table.mst, table.effectiveAt),
    // "이 법의 이 날짜 시행판" — 시점 조회가 이 인덱스 하나로 끝난다.
    index("law_version_point_in_time_idx").on(table.lawId, table.effectiveAt),
    // 판결문은 법을 이름으로 인용한다("「도로교통법」 제3조").
    index("law_version_name_idx").on(table.name, table.effectiveAt),
  ],
);

/**
 * 법령 한 판의 조문.
 *
 * **조 번호만으로는 유일하지 않다.** `제4조`와 `제4조의2`는 둘 다 조문번호가 `4`이고
 * 가지번호로 갈린다 — 도로교통법 2019년 판 209개 조문 중 29건이 그랬다. 가지번호를
 * 빼고 유일 제약을 걸면 저장부터 실패하거나, 더 나쁘게는 조회가 엉뚱한 조문을 돌려준다.
 *
 * 항은 `clauses`에 JSON으로 둔다. 항을 따로 표로 빼지 않는 이유는 **항만 따로 조회할 일이
 * 없기 때문**이다 — 언제나 조문을 찾고 그 안에서 항을 고른다.
 */
const lawArticle = sqliteTable(
  "law_article",
  {
    id: text("id").primaryKey(),
    lawVersionId: text("law_version_id")
      .notNull()
      .references(() => lawVersion.id, { onDelete: "cascade" }),
    articleNo: text("article_no").notNull(),
    /** `제4조의2`의 `2`. 가지번호가 없으면 빈 문자열로 둔다 — null은 UNIQUE에서 서로 다르다. */
    branchNo: text("branch_no").notNull().default(""),
    title: text("title"),
    /** 조문 본문. 항이 있으면 대개 제목 줄만 들어 있다. */
    body: text("body"),
    /**
     * **이 조문의** 시행일. 법 전체의 시행일과 다를 수 있다.
     *
     * 한 개정으로 바뀐 조문들이 서로 다른 날 시행되는 일이 흔하다. 그래서 "그 판결
     * 당시의 법"을 정확히 보려면 판을 고르는 것만으로 부족하고, 그 판 안에서
     * **그날 이미 시행된 조문만** 골라야 한다.
     */
    effectiveAt: integer("effective_at", { mode: "timestamp_ms" }),
    /** `[{ number, text }]`. 원문 그대로 두어 대조에 쓴다(§5.5 [6a]). */
    clauses: text("clauses", { mode: "json" }).notNull(),
    orderIdx: integer("order_idx").notNull(),
  },
  (table) => [
    unique("law_article_unique").on(table.lawVersionId, table.articleNo, table.branchNo),
    index("law_article_version_idx").on(table.lawVersionId, table.orderIdx),
  ],
);

/** 외부 API 응답 캐시. 법제처 호출 수를 줄이고, 장애 시에도 화면이 뜨게 한다([F-39]). */
const apiCache = sqliteTable(
  "api_cache",
  {
    id: text("id").primaryKey(),
    endpoint: text("endpoint").notNull(),
    paramsHash: text("params_hash").notNull(),
    response: text("response", { mode: "json" }).notNull(),
    fetchedAt: createdAt(),
    /** null이면 만료 없음. "당시 법령"처럼 변하지 않는 과거 데이터가 여기 해당한다. */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  },
  (table) => [unique("api_cache_key_unique").on(table.endpoint, table.paramsHash)],
);

/** drizzle 클라이언트에 넘길 스키마 묶음. 네임스페이스 import 대신 명시적으로 모은다. */
const corpusSchema = {
  apiCache,
  generationJob,
  generationUsage,
  judgment,
  judgmentSpan,
  lawArticle,
  lawVersion,
  lookupMiss,
  nodeSpan,
  party,
  rendition,
  renditionSentence,
  structureNode,
  termGloss,
};

export {
  apiCache,
  corpusSchema,
  CONFIDENCES,
  generationJob,
  generationUsage,
  JOB_STATUSES,
  judgment,
  lawArticle,
  lawVersion,
  judgmentSpan,
  LEVELS,
  lookupMiss,
  nodeSpan,
  OUTCOMES,
  party,
  rendition,
  renditionSentence,
  structureNode,
  termGloss,
};
