/** 법령자료 DB. 판결문 코퍼스와 물리적으로 분리해 독립 백업·동기화할 수 있다. */

import { sql } from "drizzle-orm";
import { blob, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

/** 법령 한 판. 목록은 모두 저장하고 본문은 실제로 필요한 판만 내려받는다. */
const lawVersion = sqliteTable(
  "law_version",
  {
    id: text("id").primaryKey(),
    lawId: text("law_id").notNull(),
    mst: text("mst").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    kind: text("kind"),
    ministry: text("ministry"),
    promulgatedAt: integer("promulgated_at", { mode: "timestamp_ms" }),
    effectiveAt: integer("effective_at", { mode: "timestamp_ms" }),
    historyCode: text("history_code"),
    bodyFetchedAt: integer("body_fetched_at", { mode: "timestamp_ms" }),
    sections: text("sections", { mode: "json" }),
    fetchedAt: createdAt(),
  },
  (table) => [
    unique("law_version_mst_effective_unique").on(table.mst, table.effectiveAt),
    index("law_version_point_in_time_idx").on(table.lawId, table.effectiveAt),
    index("law_version_name_idx").on(table.name, table.effectiveAt),
  ],
);

/** 법령 한 판의 조문. 제4조와 제4조의2를 구분하기 위해 가지번호도 키에 포함한다. */
const lawArticle = sqliteTable(
  "law_article",
  {
    id: text("id").primaryKey(),
    lawVersionId: text("law_version_id")
      .notNull()
      .references(() => lawVersion.id, { onDelete: "cascade" }),
    articleNo: text("article_no").notNull(),
    branchNo: text("branch_no").notNull().default(""),
    title: text("title"),
    body: text("body"),
    effectiveAt: integer("effective_at", { mode: "timestamp_ms" }),
    clauses: text("clauses", { mode: "json" }).notNull(),
    orderIdx: integer("order_idx").notNull(),
  },
  (table) => [
    unique("law_article_unique").on(table.lawVersionId, table.articleNo, table.branchNo),
    index("law_article_version_idx").on(table.lawVersionId, table.orderIdx),
  ],
);

const legalResource = sqliteTable(
  "legal_resource",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    kind: text("kind"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    /** 상세 API를 조회할 때 넘기는 MST/ID. 상세가 없는 별표서식은 null이다. */
    detailKey: text("detail_key"),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    missingAt: integer("missing_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    unique("legal_resource_source_external_unique").on(table.source, table.externalId),
    index("legal_resource_source_missing_idx").on(table.source, table.missingAt),
  ],
);

/** 공식 상세 응답 전체. 텍스트 위주 JSON은 gzip으로 압축해 디스크 사용량을 제한한다. */
const legalResourceDetail = sqliteTable(
  "legal_resource_detail",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    detailKey: text("detail_key").notNull(),
    payload: blob("payload", { mode: "buffer" }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    /** 이 상세를 만들 때의 목록 메타데이터 해시. 같으면 중단 후 재실행 때 건너뛴다. */
    listPayloadHash: text("list_payload_hash").notNull(),
    encoding: text("encoding").notNull().default("gzip-json"),
    originalBytes: integer("original_bytes").notNull(),
    storedBytes: integer("stored_bytes").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
    /** 공개 기본값은 이 불변 판을 가리킨다. 기존 설치 이관 때문에 nullable이다. */
    currentRevisionId: text("current_revision_id"),
  },
  (table) => [
    unique("legal_resource_detail_source_key_unique").on(table.source, table.detailKey),
    index("legal_resource_detail_source_fetched_idx").on(table.source, table.fetchedAt),
  ],
);

/** 상세 응답의 불변 이력. 같은 본문 해시는 한 상세 안에서 한 번만 저장한다. */
const legalResourceDetailRevision = sqliteTable(
  "legal_resource_detail_revision",
  {
    id: text("id").primaryKey(),
    detailId: text("detail_id")
      .notNull()
      .references(() => legalResourceDetail.id, { onDelete: "cascade" }),
    /** 현재판은 detail 행의 payload를 쓰며, 과거판이 되는 순간 여기에 보관한다. */
    payload: blob("payload", { mode: "buffer" }),
    payloadHash: text("payload_hash").notNull(),
    listPayloadHash: text("list_payload_hash").notNull(),
    encoding: text("encoding").notNull().default("gzip-json"),
    originalBytes: integer("original_bytes").notNull(),
    storedBytes: integer("stored_bytes").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    unique("legal_detail_revision_hash_unique").on(table.detailId, table.payloadHash),
    index("legal_detail_revision_fetched_idx").on(table.detailId, table.fetchedAt),
  ],
);

/** 새 상세 원문판을 기준판과 대조한 결정론적 staging 검사 결과다. */
const legalDetailRevisionCheck = sqliteTable(
  "legal_detail_revision_check",
  {
    revisionId: text("revision_id")
      .primaryKey()
      .references(() => legalResourceDetailRevision.id, { onDelete: "cascade" }),
    baselineRevisionId: text("baseline_revision_id"),
    state: text("state", { enum: ["passed", "needs_review", "failed"] }).notNull(),
    unchanged: integer("unchanged").notNull(),
    changed: integer("changed").notNull(),
    added: integer("added").notNull(),
    removed: integer("removed").notNull(),
    issues: text("issues", { mode: "json" }).$type<string[]>().notNull(),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("legal_detail_check_state_idx").on(table.state, table.checkedAt)],
);

/** 별표·서식의 HWP/PDF는 파일로 두고 무결성과 위치만 DB에서 관리한다. */
const legalResourceFile = sqliteTable(
  "legal_resource_file",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    format: text("format").notNull(),
    sourcePath: text("source_path").notNull(),
    localPath: text("local_path").notNull(),
    contentHash: text("content_hash").notNull(),
    bytes: integer("bytes").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    unique("legal_resource_file_key_unique").on(table.source, table.externalId, table.format),
  ],
);

const legalSyncRun = sqliteTable(
  "legal_sync_run",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    trigger: text("trigger", { enum: ["manual", "automatic"] }).notNull(),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    received: integer("received").notNull().default(0),
    added: integer("added").notNull().default(0),
    changed: integer("changed").notNull().default(0),
    restored: integer("restored").notNull().default(0),
    missing: integer("missing").notNull().default(0),
    detailReceived: integer("detail_received").notNull().default(0),
    detailAdded: integer("detail_added").notNull().default(0),
    detailChanged: integer("detail_changed").notNull().default(0),
    detailUnavailable: integer("detail_unavailable").notNull().default(0),
    detailFailed: integer("detail_failed").notNull().default(0),
    detail: text("detail"),
  },
  (table) => [index("legal_sync_run_source_started_idx").on(table.source, table.startedAt)],
);

const legalSchema = {
  legalDetailRevisionCheck,
  lawArticle,
  lawVersion,
  legalResource,
  legalResourceDetail,
  legalResourceDetailRevision,
  legalResourceFile,
  legalSyncRun,
};

export {
  legalDetailRevisionCheck,
  lawArticle,
  lawVersion,
  legalResource,
  legalResourceDetail,
  legalResourceDetailRevision,
  legalResourceFile,
  legalSchema,
  legalSyncRun,
};
