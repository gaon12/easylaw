/**
 * 코퍼스 저장소.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 쿼리는 이 함수들 뒤에 둔다. 라우트 핸들러나 컴포넌트가
 * 테이블을 직접 만지지 않아야 `corpus`/`app` 양쪽에 같은 파이프라인을 쓸 수 있다.
 */

import { and, asc, desc, eq, inArray, like, lt, lte, or, sql } from "drizzle-orm";
import { STALE_AFTER_MS } from "@/lib/timing";
import type { CorpusDb } from "../client";
import {
  generationJob,
  generationUsage,
  judgment,
  judgmentSpan,
  lawArticle,
  lawVersion,
  lookupMiss,
  nodeSpan,
  rendition,
  renditionSentence,
  structureNode,
} from "./schema";
import { searchLawIds } from "./search";

type Level = (typeof rendition.level.enumValues)[number];
type JobStage = (typeof generationJob.stage.enumValues)[number];
type JobStatus = (typeof generationJob.status.enumValues)[number];
type StructureKind = (typeof structureNode.kind.enumValues)[number];
type Confidence = (typeof renditionSentence.confidence.enumValues)[number];
type Outcome = (typeof judgment.outcome.enumValues)[number];

interface JudgmentInput {
  caseNoCanonical: string;
  caseNoDisplay: string;
  caseName?: string | undefined;
  court?: string | undefined;
  decidedAt?: Date | undefined;
  caseType?: string | undefined;
  outcome?: Outcome | undefined;
  source: "law_go_kr" | "manual";
  sourceUrl?: string | undefined;
}

interface SpanInput {
  paraIdx: number;
  sentIdx: number;
  charStart: number;
  charEnd: number;
  text: string;
}

interface SentenceInput {
  orderIdx: number;
  role?: "heading" | "body";
  text: string;
  structureNodeId?: string | null;
  confidence: Confidence;
  checkReason?: string | null;
}

const newId = (): string => crypto.randomUUID();

function findJudgmentByCaseNo(db: CorpusDb, caseNoCanonical: string) {
  return db.select().from(judgment).where(eq(judgment.caseNoCanonical, caseNoCanonical)).get();
}

function upsertJudgment(db: CorpusDb, input: JudgmentInput): string {
  const existing = findJudgmentByCaseNo(db, input.caseNoCanonical);
  if (existing) {
    return existing.id;
  }

  const id = newId();
  db.insert(judgment)
    .values({
      id,
      caseNoCanonical: input.caseNoCanonical,
      caseNoDisplay: input.caseNoDisplay,
      caseName: input.caseName ?? null,
      court: input.court ?? null,
      decidedAt: input.decidedAt ?? null,
      caseType: input.caseType ?? null,
      outcome: input.outcome ?? "unknown",
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      fetchedAt: new Date(),
    })
    .run();
  return id;
}

/**
 * 원문 본문을 저장한다.
 *
 * 문장 저장과 `textCachedAt` 표시를 한 트랜잭션으로 묶는다. 중간에 끊기면
 * "본문이 있다고 표시됐지만 문장은 없는" 판결문이 남고, 근거 연결이 통째로 깨진다.
 */
function saveJudgmentText(db: CorpusDb, judgmentId: string, spans: readonly SpanInput[]): void {
  db.transaction((tx) => {
    tx.delete(judgmentSpan).where(eq(judgmentSpan.judgmentId, judgmentId)).run();
    if (spans.length > 0) {
      tx.insert(judgmentSpan)
        .values(spans.map((span) => ({ id: newId(), judgmentId, ...span })))
        .run();
    }
    tx.update(judgment).set({ textCachedAt: new Date() }).where(eq(judgment.id, judgmentId)).run();
  });
}

function listSpans(db: CorpusDb, judgmentId: string) {
  return db
    .select()
    .from(judgmentSpan)
    .where(eq(judgmentSpan.judgmentId, judgmentId))
    .orderBy(judgmentSpan.paraIdx, judgmentSpan.sentIdx)
    .all();
}

/** 이 레벨·프롬프트 버전의 변환본이 이미 있는가. 있으면 생성하지 않는다. */
function findRendition(db: CorpusDb, judgmentId: string, level: Level, promptVersion: string) {
  return db
    .select()
    .from(rendition)
    .where(
      and(
        eq(rendition.judgmentId, judgmentId),
        eq(rendition.level, level),
        eq(rendition.promptVersion, promptVersion),
      ),
    )
    .get();
}

/** 프롬프트 버전을 가리지 않고 가장 최근 것. 오래된 버전이라도 보여 주고 재생성을 권한다. */
function findLatestRendition(db: CorpusDb, judgmentId: string, level: Level) {
  return db
    .select()
    .from(rendition)
    .where(and(eq(rendition.judgmentId, judgmentId), eq(rendition.level, level)))
    .orderBy(desc(rendition.generatedAt))
    .get();
}

function listSentences(db: CorpusDb, renditionId: string) {
  const sentences = db
    .select()
    .from(renditionSentence)
    .where(eq(renditionSentence.renditionId, renditionId))
    .orderBy(renditionSentence.orderIdx)
    .all();

  /*
   * 근거 연결은 rendition_sentence → structure_node → node_span에 있다. 화면에서 문장마다
   * 다시 조회하면 N+1이 되므로 이 함수에서 한 번에 읽어 `sourceSpanIds`로 넘긴다.
   * 구조 노드가 삭제된 옛 변환본은 빈 배열로 남겨 안전하게 "근거 보기"를 숨긴다.
   */
  const nodeIds = sentences
    .map((sentence) => sentence.structureNodeId)
    .filter((id): id is string => id !== null);
  if (nodeIds.length === 0) {
    return sentences.map((sentence) => ({ ...sentence, sourceSpanIds: [] as string[] }));
  }

  const spansByNode = new Map<string, string[]>();
  for (const row of db
    .select({ structureNodeId: nodeSpan.structureNodeId, spanId: nodeSpan.spanId })
    .from(nodeSpan)
    .where(inArray(nodeSpan.structureNodeId, nodeIds))
    .all()) {
    const spans = spansByNode.get(row.structureNodeId) ?? [];
    spans.push(row.spanId);
    spansByNode.set(row.structureNodeId, spans);
  }

  return sentences.map((sentence) => ({
    ...sentence,
    sourceSpanIds:
      sentence.structureNodeId === null ? [] : (spansByNode.get(sentence.structureNodeId) ?? []),
  }));
}

function saveRendition(
  db: CorpusDb,
  input: {
    judgmentId: string;
    level: Level;
    model: string;
    promptVersion: string;
    sentences: readonly SentenceInput[];
  },
): string {
  return db.transaction((tx) => {
    const id = newId();
    tx.insert(rendition)
      .values({
        id,
        judgmentId: input.judgmentId,
        level: input.level,
        model: input.model,
        promptVersion: input.promptVersion,
      })
      .run();

    if (input.sentences.length > 0) {
      tx.insert(renditionSentence)
        .values(
          input.sentences.map((sentence) => ({
            id: newId(),
            renditionId: id,
            orderIdx: sentence.orderIdx,
            role: sentence.role ?? ("body" as const),
            text: sentence.text,
            structureNodeId: sentence.structureNodeId ?? null,
            confidence: sentence.confidence,
            checkReason: sentence.checkReason ?? null,
          })),
        )
        .run();
    }
    return id;
  });
}

type ClaimResult =
  /** 내가 선점했다. 파이프라인을 돌려도 된다. */
  | { readonly kind: "claimed"; readonly jobId: string }
  /** 다른 요청이 이미 만들고 있다. 새로 만들지 말고 이 작업을 지켜본다. */
  | { readonly kind: "running"; readonly jobId: string }
  /** 이미 끝났다. 변환본을 읽으면 된다. */
  | { readonly kind: "done"; readonly jobId: string };

/* 좀비 판정 기준은 `lib/timing.ts` 하나뿐이다. 여기서 따로 정하면 어긋난다. */

/** 새 작업을 만들어 선점을 시도한다. 이미 있으면 아무 일도 하지 않고 undefined를 낸다. */
function insertClaim(
  db: CorpusDb,
  input: { judgmentId: string; level: Level; promptVersion: string; workerId: string; now: Date },
): string | undefined {
  const rows = db
    .insert(generationJob)
    .values({
      id: newId(),
      judgmentId: input.judgmentId,
      level: input.level,
      promptVersion: input.promptVersion,
      status: "running",
      claimedBy: input.workerId,
      heartbeatAt: input.now,
      attempts: 1,
    })
    .onConflictDoNothing()
    .returning({ id: generationJob.id })
    .all();
  return rows[0]?.id;
}

function findJob(db: CorpusDb, judgmentId: string, level: Level, promptVersion: string) {
  return db
    .select()
    .from(generationJob)
    .where(
      and(
        eq(generationJob.judgmentId, judgmentId),
        eq(generationJob.level, level),
        eq(generationJob.promptVersion, promptVersion),
      ),
    )
    .get();
}

/** 실패했거나 heartbeat가 멈춘 작업만 회수한다. 조건을 UPDATE에 담아 경합을 DB가 판정하게 한다. */
function reclaimJob(
  db: CorpusDb,
  job: { id: string; attempts: number },
  workerId: string,
  now: Date,
): boolean {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const rows = db
    .update(generationJob)
    .set({
      status: "running",
      claimedBy: workerId,
      heartbeatAt: now,
      attempts: job.attempts + 1,
      error: null,
    })
    .where(
      and(
        eq(generationJob.id, job.id),
        or(eq(generationJob.status, "failed"), lt(generationJob.heartbeatAt, staleBefore)),
      ),
    )
    .returning({ id: generationJob.id })
    .all();
  return rows.length > 0;
}

/**
 * 생성 작업을 선점한다. `.dev/PRODUCT.md` §5.3
 *
 * 같은 판례를 열 명이 동시에 열어도 LLM 호출은 한 번이어야 한다.
 * 유니크 제약 + `ON CONFLICT DO NOTHING`이 자물쇠 역할을 하고, 선점에 실패한 요청은
 * 기존 작업에 붙는다. heartbeat가 멈춘 작업은 회수한다 — 선점만 하고 죽은 작업이
 * 캐시를 영구히 막는 것이 이 구조에서 가장 나쁜 결말이다.
 */
function claimGenerationJob(
  db: CorpusDb,
  input: {
    judgmentId: string;
    level: Level;
    promptVersion: string;
    workerId: string;
    now?: Date;
  },
): ClaimResult {
  const now = input.now ?? new Date();

  const claimedId = insertClaim(db, { ...input, now });
  if (claimedId !== undefined) {
    return { kind: "claimed", jobId: claimedId };
  }

  const existing = findJob(db, input.judgmentId, input.level, input.promptVersion);
  // 유니크 제약 때문에 여기서 행이 없을 수는 없다. 있어도 다시 시도하는 편이 안전하다.
  if (!existing) {
    return claimGenerationJob(db, { ...input, now });
  }
  if (existing.status === "done") {
    return { kind: "done", jobId: existing.id };
  }
  if (reclaimJob(db, existing, input.workerId, now)) {
    return { kind: "claimed", jobId: existing.id };
  }
  return { kind: "running", jobId: existing.id };
}

function heartbeatGenerationJob(db: CorpusDb, jobId: string, now: Date = new Date()): void {
  db.update(generationJob).set({ heartbeatAt: now }).where(eq(generationJob.id, jobId)).run();
}

/**
 * 지금 무엇을 하고 있는지 적는다. 기다리는 사람이 볼 유일한 창이다(`PRODUCT.md` §5.3).
 *
 * **단계를 적는 것이 곧 heartbeat다.** 두 번 쓰지 않는다 — 단계가 바뀌었다는 것은
 * 그 작업이 살아 있다는 뜻이고, 따로 찍으면 언젠가 한쪽만 남는다.
 */
function setGenerationStage(
  db: CorpusDb,
  jobId: string,
  stage: JobStage,
  now: Date = new Date(),
): void {
  db.update(generationJob)
    .set({ stage, heartbeatAt: now })
    .where(eq(generationJob.id, jobId))
    .run();
}

interface JobProgress {
  readonly status: JobStatus;
  readonly stage: JobStage | null;
  readonly error: string | null;
  /** 마지막으로 살아 있다고 말한 시각. 이것이 멈추면 좀비다(`STALE_AFTER_MS`). */
  readonly heartbeatAt: Date | null;
}

/** 이 변환본을 만드는 작업이 지금 어떤 상태인가. 없으면 undefined. */
function findGenerationProgress(
  db: CorpusDb,
  input: { judgmentId: string; level: Level; promptVersion: string },
): JobProgress | undefined {
  const row = findJob(db, input.judgmentId, input.level, input.promptVersion);
  if (row === undefined) {
    return;
  }
  return {
    status: row.status,
    stage: row.stage,
    error: row.error,
    heartbeatAt: row.heartbeatAt,
  };
}

function finishGenerationJob(
  db: CorpusDb,
  jobId: string,
  result: { ok: true } | { ok: false; error: string },
  now: Date = new Date(),
): void {
  db.update(generationJob)
    .set({
      status: result.ok ? "done" : "failed",
      // 끝난 작업에 단계가 남아 있으면 화면이 "아직 만드는 중"으로 읽는다.
      stage: null,
      error: result.ok ? null : result.error,
      finishedAt: now,
      heartbeatAt: now,
    })
    .where(eq(generationJob.id, jobId))
    .run();
}

/**
 * 오늘 몫에서 한 번을 뗀다. 남은 것이 없으면 `false`. `FEATURES.md` [F-42]
 *
 * **세는 것과 판단하는 것을 한 문장으로 한다.** 읽고 나서 더하면 그 사이에 들어온 요청이
 * 마지막 한 번을 같이 가져간다 — 상한이 있으나 마나 해진다. 조건을 UPDATE에 실어
 * SQLite가 판정하게 하고, 갱신된 행이 있는지로 성패를 읽는다(작업 선점과 같은 방식이다).
 *
 * `day`는 사이트 시간대의 날짜 문자열이다. 이 계층은 시간대를 모르므로 받아서 쓴다.
 */
function reserveGenerationSlot(db: CorpusDb, input: { day: string; limit: number }): boolean {
  if (input.limit <= 0) {
    return false;
  }

  const rows = db
    .insert(generationUsage)
    .values({ day: input.day, count: 1 })
    .onConflictDoUpdate({
      target: generationUsage.day,
      set: { count: sql`${generationUsage.count} + 1` },
      setWhere: lt(generationUsage.count, input.limit),
    })
    .returning({ count: generationUsage.count })
    .all();

  return rows.length > 0;
}

/** 그날 몇 번 돌렸나. 없던 날은 0이다. */
function countGenerationsOn(db: CorpusDb, day: string): number {
  return db.select().from(generationUsage).where(eq(generationUsage.day, day)).get()?.count ?? 0;
}

interface StructureNodeInput {
  kind: StructureKind;
  /** 종류마다 다른 필드. 형태 검증은 이 계층이 아니라 추출 단계의 zod가 한다. */
  payload: unknown;
  occurredOn?: Date | null;
  orderIdx: number;
  /** 이 노드의 근거가 되는 원문 span. **비어 있으면 안 된다**(아래 참고). */
  spanIds: readonly string[];
}

interface StructureNodeRow {
  readonly id: string;
  readonly kind: StructureKind;
  readonly payload: unknown;
  readonly occurredOn: Date | null;
  readonly orderIdx: number;
  readonly spanIds: readonly string[];
}

/**
 * 구조화 추출 결과를 저장한다. `PRODUCT.md` §5.5 [4]
 *
 * **근거 없는 노드를 받지 않는다.** P2("근거 없는 문장은 표시하지 않는다")는 렌더 단계의
 * 규칙처럼 보이지만, 근거가 비어 있는 노드를 여기서 통과시키면 그 노드에서 파생된 문장은
 * 되짚을 원문이 없는 채로 태어난다. 화면에서 막는 것보다 **들어오지 못하게 하는 것**이 싸다.
 *
 * **span이 이 판결문의 것인지도 확인한다.** 외래 키는 span이 존재한다는 것만 보장하고
 * 어느 판결문의 span인지는 보지 않는다. 모델이 다른 판결문의 id를 지어내면 FK는 통과하고,
 * 근거 하이라이트가 남의 판결문을 가리키게 된다. 여기가 그것을 막을 마지막 자리다.
 *
 * 노드와 근거 연결을 한 트랜잭션으로 묶는다(§10.2) — 중간에 끊기면 근거가 반쯤 붙은
 * 구조가 남고, 그것은 근거가 없는 것보다 나쁘다. *
 * **이미 구조가 있으면 그것을 남긴다.** 예전에는 부를 때마다 옛 구조를 지우고 새 id로
 * 다시 넣었는데, 그 사이에 **다른 레벨이 그 id로 문장을 만들고 있을 수 있다.** 실제로
 * L2와 L4를 함께 돌리면 둘 다 구조가 없는 것을 보고 각자 추출하고, 나중에 저장한 쪽이
 * 앞선 쪽의 노드를 지워서 `FOREIGN KEY constraint failed`로 끝났다.
 *
 * 뒤에 온 쪽이 뽑은 구조를 버리는 셈이지만, 같은 판결문에서 같은 프롬프트로 뽑은
 * 구조라 어느 쪽을 써도 된다. 반대로 **id가 바뀌면 그 순간 남의 작업이 깨진다.**
 * 다시 뽑고 싶으면 구조를 지우고 부른다 — 지우는 것은 명시적인 일이어야 한다.
 *
 * 확인과 저장을 한 트랜잭션에 묶고 `immediate`로 연다. 둘이 동시에 "비어 있다"를 보고
 * 각자 넣는 일을 막는다 — deferred로 열면 읽는 동안에는 쓰기 잠금을 잡지 않는다.
 */
/** 트랜잭션 안의 db 손잡이. 드리즐이 넘겨 주는 것과 같은 타입이다. */
type CorpusTx = Parameters<Parameters<CorpusDb["transaction"]>[0]>[0];

/** 노드와 근거 연결을 넣는다. 부르는 쪽이 이미 "넣어도 되는가"를 판단했다. */
function insertStructure(
  tx: CorpusTx,
  judgmentId: string,
  promptVersion: string,
  nodes: readonly StructureNodeInput[],
): string[] {
  const ids = nodes.map(() => newId());

  tx.insert(structureNode)
    .values(
      nodes.map((node, index) => ({
        id: ids[index] as string,
        judgmentId,
        promptVersion,
        kind: node.kind,
        payload: node.payload,
        occurredOn: node.occurredOn ?? null,
        orderIdx: node.orderIdx,
      })),
    )
    .run();

  tx.insert(nodeSpan)
    .values(
      nodes.flatMap((node, index) =>
        // 같은 span을 두 번 적어 오는 모델이 있다. 복합 기본키가 터지기 전에 여기서 줄인다.
        [...new Set(node.spanIds)].map((spanId) => ({
          structureNodeId: ids[index] as string,
          spanId,
        })),
      ),
    )
    .run();

  return ids;
}

function assertNodesGrounded(nodes: readonly StructureNodeInput[], valid: ReadonlySet<string>) {
  for (const node of nodes) {
    if (node.spanIds.length === 0) {
      throw new Error(
        `근거 span이 없는 구조 노드입니다 (kind=${node.kind}, order=${node.orderIdx}).`,
      );
    }
    for (const spanId of node.spanIds) {
      if (!valid.has(spanId)) {
        throw new Error(`이 판결문의 span이 아닙니다 (node kind=${node.kind}, span=${spanId}).`);
      }
    }
  }
}

function saveStructure(
  db: CorpusDb,
  judgmentId: string,
  promptVersion: string,
  nodes: readonly StructureNodeInput[],
): string[] {
  assertNodesGrounded(
    nodes,
    new Set(
      db
        .select({ id: judgmentSpan.id })
        .from(judgmentSpan)
        .where(eq(judgmentSpan.judgmentId, judgmentId))
        .all()
        .map((row) => row.id),
    ),
  );

  return db.transaction(
    (tx) => {
      const existing = tx
        .select({ id: structureNode.id })
        .from(structureNode)
        .where(
          and(
            eq(structureNode.judgmentId, judgmentId),
            eq(structureNode.promptVersion, promptVersion),
          ),
        )
        .orderBy(structureNode.orderIdx)
        .all()
        .map((row) => row.id);
      if (existing.length > 0) {
        return existing;
      }
      if (nodes.length === 0) {
        return [];
      }

      return insertStructure(tx, judgmentId, promptVersion, nodes);
    },
    { behavior: "immediate" },
  );
}

/**
 * 구조 노드를 근거 span과 함께 읽는다.
 *
 * 노드마다 span을 따로 조회하지 않는다(§10.2 N+1 금지) — 판결문 하나에 노드가 수십 개고,
 * 레벨 렌더링은 그 전부를 한 번에 본다.
 */
function listStructureNodes(
  db: CorpusDb,
  judgmentId: string,
  promptVersion: string,
): StructureNodeRow[] {
  const nodes = db
    .select()
    .from(structureNode)
    .where(
      and(eq(structureNode.judgmentId, judgmentId), eq(structureNode.promptVersion, promptVersion)),
    )
    .orderBy(structureNode.orderIdx)
    .all();

  if (nodes.length === 0) {
    return [];
  }

  const links = db
    .select()
    .from(nodeSpan)
    .where(
      inArray(
        nodeSpan.structureNodeId,
        nodes.map((node) => node.id),
      ),
    )
    .all();

  const byNode = new Map<string, string[]>();
  for (const link of links) {
    const bucket = byNode.get(link.structureNodeId);
    if (bucket === undefined) {
      byNode.set(link.structureNodeId, [link.spanId]);
    } else {
      bucket.push(link.spanId);
    }
  }

  return nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    payload: node.payload,
    occurredOn: node.occurredOn,
    orderIdx: node.orderIdx,
    spanIds: byNode.get(node.id) ?? [],
  }));
}

interface LawVersionInput {
  lawId: string;
  mst: string;
  name: string;
  shortName?: string | undefined;
  kind?: string | undefined;
  ministry?: string | undefined;
  promulgatedAt?: Date | undefined;
  effectiveAt?: Date | undefined;
  historyCode?: string | undefined;
}

/**
 * SQLite 한 문장에 넣을 수 있는 바인딩 변수에는 상한이 있다. 법령 판이 168,496개라
 * 한 번에 밀어 넣으면 그 상한에 걸린다. 열이 10개 남짓이라 넉넉히 잡아 500행씩 끊는다.
 */
const INSERT_CHUNK = 500;

/**
 * 법령 판 목록을 넣는다. `PRODUCT.md` §6.4
 *
 * **이미 있는 판은 덮어쓰지 않는다.** 과거 판의 내용은 변하지 않으므로(§6.4) 다시 받을
 * 이유가 없고, 덮어쓰면 이미 받아 둔 본문(`bodyFetchedAt`)까지 날아간다.
 * 목록 동기화를 여러 번 돌려도 결과가 같아야 한다.
 */
function upsertLawVersions(db: CorpusDb, versions: readonly LawVersionInput[]): number {
  if (versions.length === 0) {
    return 0;
  }

  return db.transaction((tx) => {
    let added = 0;
    for (let start = 0; start < versions.length; start += INSERT_CHUNK) {
      const chunk = versions.slice(start, start + INSERT_CHUNK);
      const result = tx
        .insert(lawVersion)
        .values(
          chunk.map((version) => ({
            id: newId(),
            lawId: version.lawId,
            mst: version.mst,
            name: version.name,
            shortName: version.shortName ?? null,
            kind: version.kind ?? null,
            ministry: version.ministry ?? null,
            promulgatedAt: version.promulgatedAt ?? null,
            effectiveAt: version.effectiveAt ?? null,
            historyCode: version.historyCode ?? null,
          })),
        )
        // mst 하나로는 유일하지 않다 — 시행일까지 봐야 한 판이다(스키마 주석 참조).
        .onConflictDoNothing({ target: [lawVersion.mst, lawVersion.effectiveAt] })
        .run();
      added += result.changes;
    }
    return added;
  });
}

/**
 * **이 날짜에 시행 중이던 판**을 찾는다. `PRODUCT.md` §6.4 · [F-30]
 *
 * 시행일이 기준 날짜 **이하**인 것 중 가장 늦은 것이다. 판결이 2019-05-03에 났다면
 * 그날 시행 중이던 법이 근거이지, 오늘 시행 중인 법이 아니다.
 *
 * 법제처에 묻지 않는다 — 목록을 미리 받아 두었으므로 인덱스 하나로 끝난다.
 */
function findLawVersionAt(db: CorpusDb, key: { lawId: string } | { name: string }, at: Date) {
  const matchesLaw =
    "lawId" in key ? eq(lawVersion.lawId, key.lawId) : eq(lawVersion.name, key.name);

  return db
    .select()
    .from(lawVersion)
    .where(and(matchesLaw, lte(lawVersion.effectiveAt, at)))
    .orderBy(desc(lawVersion.effectiveAt))
    .get();
}

/**
 * 이 이름의 법이 **한 판이라도** 있는가.
 *
 * "우리가 모르는 법"과 "그때는 아직 없던 법"을 구분하는 데 쓴다. 둘은 인용 검증에서
 * 결과가 달라야 한다 — 앞은 이름이 틀렸거나 동기화가 덜 된 것이고, 뒤는 판결일이
 * 제정 전이라는 사실이다.
 */
function findLatestLawVersion(db: CorpusDb, name: string) {
  return db
    .select()
    .from(lawVersion)
    .where(eq(lawVersion.name, name))
    .orderBy(desc(lawVersion.effectiveAt))
    .get();
}

/** 같은 mst가 시행일만 다르게 여럿일 수 있다. 가장 늦게 시행된 것을 준다. */
function findLawVersionByMst(db: CorpusDb, mst: string) {
  return db
    .select()
    .from(lawVersion)
    .where(eq(lawVersion.mst, mst))
    .orderBy(desc(lawVersion.effectiveAt))
    .get();
}

interface LawArticleInput {
  articleNo: string;
  /** 가지번호. `제4조의2`의 `2`. 없으면 빈 문자열 — null은 UNIQUE에서 서로 다르다. */
  branchNo?: string | undefined;
  title?: string | undefined;
  body?: string | undefined;
  clauses: readonly { number: string | undefined; text: string }[];
  /** 이 조문의 시행일. 법 전체의 시행일과 다를 수 있다. */
  effectiveAt?: Date | undefined;
  orderIdx: number;
}

/**
 * 한 판의 조문을 저장하고 "본문 받음"으로 표시한다.
 *
 * 저장과 표시를 한 트랜잭션으로 묶는다(§10.2). 중간에 끊기면 "본문이 있다고 표시됐지만
 * 조문은 없는" 판이 남고, 그러면 실존 검증이 모든 인용을 "없는 조문"이라 답한다.
 */
interface LawSectionInput {
  readonly title: string;
  readonly beforeArticleNo: string;
}

function saveLawArticles(
  db: CorpusDb,
  lawVersionId: string,
  articles: readonly LawArticleInput[],
  sections: readonly LawSectionInput[] = [],
): void {
  db.transaction((tx) => {
    tx.delete(lawArticle).where(eq(lawArticle.lawVersionId, lawVersionId)).run();

    for (let start = 0; start < articles.length; start += INSERT_CHUNK) {
      const chunk = articles.slice(start, start + INSERT_CHUNK);
      tx.insert(lawArticle)
        .values(
          chunk.map((article) => ({
            id: newId(),
            lawVersionId,
            articleNo: article.articleNo,
            branchNo: article.branchNo ?? "",
            title: article.title ?? null,
            body: article.body ?? null,
            clauses: article.clauses,
            effectiveAt: article.effectiveAt ?? null,
            orderIdx: article.orderIdx,
          })),
        )
        .run();
    }

    tx.update(lawVersion)
      .set({ bodyFetchedAt: new Date(), sections })
      .where(eq(lawVersion.id, lawVersionId))
      .run();
  });
}

/**
 * 조문 하나를 찾는다. **가지번호까지 맞춘다.**
 *
 * `제4조`를 찾을 때 `제4조의2`가 나오면 안 된다 — 조 번호가 같은 조문이 실제로 있고
 * (도로교통법 209개 중 29건), 느슨하게 맞추면 조용히 틀린 근거를 붙인다.
 */
/** 장·절 제목. 본문과 함께 저장돼 있다. */
function listLawSections(db: CorpusDb, lawVersionId: string): LawSectionInput[] {
  const row = db
    .select({ sections: lawVersion.sections })
    .from(lawVersion)
    .where(eq(lawVersion.id, lawVersionId))
    .get();
  return (row?.sections as LawSectionInput[] | null) ?? [];
}

function findLawArticle(db: CorpusDb, lawVersionId: string, articleNo: string, branchNo = "") {
  return db
    .select()
    .from(lawArticle)
    .where(
      and(
        eq(lawArticle.lawVersionId, lawVersionId),
        eq(lawArticle.articleNo, articleNo),
        eq(lawArticle.branchNo, branchNo),
      ),
    )
    .get();
}

/**
 * 한 판의 조문. `at`을 주면 **그날 이미 시행된 조문만** 준다.
 *
 * 한 개정 안에서도 조문마다 시행일이 다르다. 판만 고르고 조문을 다 보여 주면, 판결
 * 당시에는 아직 시행되지 않은 조문까지 근거로 붙일 수 있다. 시행일이 없는 조문은
 * 남긴다 — 없는 것을 버리는 쪽이 더 위험하다.
 */
function listLawArticles(db: CorpusDb, lawVersionId: string, at?: Date) {
  const rows = db
    .select()
    .from(lawArticle)
    .where(eq(lawArticle.lawVersionId, lawVersionId))
    .orderBy(asc(lawArticle.orderIdx))
    .all();

  if (at === undefined) {
    return rows;
  }
  return rows.filter((row) => row.effectiveAt === null || row.effectiveAt <= at);
}

/** 검색 한 번에 보여 줄 법령 수. 더 필요하면 사용자가 좁혀서 다시 찾는다. */
const LAW_SEARCH_LIMIT = 20;

/**
 * 이름으로 법령을 찾는다. **법제처를 부르지 않는다.**
 *
 * 판 목록을 미리 받아 뒀으므로(§6.5) 이름 검색은 우리 DB에서 끝난다. 왕복이 없으니
 * 결과가 즉시 나오고, 법제처 키가 없어도 동작한다.
 *
 * **법 하나에 판이 여럿이므로 `lawId`로 묶고 가장 최근 시행판만 낸다.** 안 그러면
 * "도로교통법"을 찾았을 때 같은 이름이 132번 나온다.
 */
/**
 * 색인이 답할 수 없는 짧은 질의를 위한 되돌림 경로.
 *
 * 트라이그램 색인은 세 글자부터 걸린다. 그보다 짧은 질의("법", "소송" 같은)는 예전처럼
 * 전체를 훑는다 — 168,494행이라 25ms쯤 걸리지만, **못 찾는 것보다는 느린 편이 낫다.**
 */
function searchLawVersionsByScan(db: CorpusDb, query: string, limit: number) {
  const pattern = `%${query}%`;
  const rows = db
    .select()
    .from(lawVersion)
    .where(or(like(lawVersion.name, pattern), like(lawVersion.shortName, pattern)))
    .orderBy(desc(lawVersion.effectiveAt))
    .limit(limit * SCAN_MATCHES_PER_LAW)
    .all();

  const byLaw = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byLaw.has(row.lawId)) {
      byLaw.set(row.lawId, row);
    }
  }
  return [...byLaw.values()].slice(0, limit);
}

/** 한 법에 판이 여럿이라 넉넉히 읽고 묶는다. 도로교통법만 132판이다. */
const SCAN_MATCHES_PER_LAW = 40;

function searchLawVersions(db: CorpusDb, query: string, limit = LAW_SEARCH_LIMIT) {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  /*
   * **색인으로 법을 먼저 고르고, 그 법의 판만 읽는다.**
   *
   * 예전에는 `name LIKE '%질의%'`로 168,494행을 훑었다(실측 25.46ms — `drizzle/corpus/0006`에
   * 수치를 남겼다). 앞머리 와일드카드는 인덱스를 쓸 수 없어서 결과가 없을수록 느려진다.
   */
  const lawIds = searchLawIds(db, trimmed, limit);
  if (lawIds === undefined) {
    // 두 글자 이하라 색인이 답할 수 없다. 예전처럼 훑는다 — 느린 것과 못 찾는 것 중 느린 쪽이 낫다.
    return searchLawVersionsByScan(db, trimmed, limit);
  }
  if (lawIds.length === 0) {
    return [];
  }

  const rows = db
    .select()
    .from(lawVersion)
    .where(inArray(lawVersion.lawId, lawIds))
    /*
     * 현행을 먼저, 그다음 시행일 역순. 이름만 맞으면 폐지된 옛 법령이 먼저 나올 수 있는데,
     * 찾는 사람이 원하는 것은 대개 지금 살아 있는 법이다.
     */
    .orderBy(desc(lawVersion.effectiveAt))
    .all();

  const byLaw = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byLaw.has(row.lawId)) {
      byLaw.set(row.lawId, row);
    }
  }

  // 색인이 매긴 순서를 지킨다 — 시행일 정렬은 **한 법 안에서** 최신 판을 고르는 데만 쓴다.
  return lawIds.flatMap((lawId) => {
    const row = byLaw.get(lawId);
    return row === undefined ? [] : [row];
  });
}

interface LawNameEntry {
  readonly lawId: string;
  readonly name: string;
  readonly shortName: string | null;
}

/**
 * 인용 사전의 원재료. 이름·약칭과 그 법의 `lawId`를 함께 낸다.
 *
 * 판결문에서 인용을 찾을 때 **사전으로 쓴다**(`lib/law-citation`). 법 이름에는 공백이
 * 들어가서(`채무자 회생 및 파산에 관한 법률`) 글만 봐서는 어디까지가 이름인지 알 수 없고,
 * 아는 이름 목록에 대고 맞추는 수밖에 없다.
 *
 * **이름이 아니라 `lawId`로 푼다.** 법은 개정되면서 이름이 바뀐다 —
 * `총포·도검·화약류단속법`과 `총포ㆍ도검ㆍ화약류 등의 안전관리에 관한 법률`은 같은 법이고
 * `lawId`가 같다. 이름으로 풀면 옛 이름으로 인용한 판결문이 그 법에 닿지 못한다.
 *
 * 약칭도 함께 낸다. 실측(2026-09-03) 약칭 2,676개 중 두 개 이상의 `lawId`를 가리키는
 * 모호한 것은 8개뿐이고, 그것들만 버리면 나머지는 그대로 쓸 수 있다.
 */
function listLawNameEntries(db: CorpusDb): LawNameEntry[] {
  return db
    .selectDistinct({
      lawId: lawVersion.lawId,
      name: lawVersion.name,
      shortName: lawVersion.shortName,
    })
    .from(lawVersion)
    .all();
}

/**
 * 없는 사건번호를 기록한다.
 *
 * 하급심 대부분은 공개되지 않아 이 경로가 흔하다(`PRODUCT.md` §5.4).
 * 나중에 공개되면 알려 주는 기능([F-43])의 근거가 된다.
 */
function recordLookupMiss(db: CorpusDb, caseNoCanonical: string, now: Date = new Date()): void {
  db.insert(lookupMiss)
    .values({ caseNoCanonical, count: 1, firstTriedAt: now, lastTriedAt: now })
    .onConflictDoUpdate({
      target: lookupMiss.caseNoCanonical,
      set: { count: sql`${lookupMiss.count} + 1`, lastTriedAt: now },
    })
    .run();
}

export {
  claimGenerationJob,
  countGenerationsOn,
  findJudgmentByCaseNo,
  findLatestLawVersion,
  findLatestRendition,
  findLawArticle,
  findLawVersionAt,
  findGenerationProgress,
  findLawVersionByMst,
  findRendition,
  finishGenerationJob,
  heartbeatGenerationJob,
  listLawArticles,
  listLawNameEntries,
  listLawSections,
  listSentences,
  listSpans,
  listStructureNodes,
  recordLookupMiss,
  reserveGenerationSlot,
  saveJudgmentText,
  saveLawArticles,
  saveRendition,
  saveStructure,
  searchLawVersions,
  setGenerationStage,
  upsertJudgment,
  upsertLawVersions,
};
export type {
  ClaimResult,
  Confidence,
  JobProgress,
  JobStage,
  JobStatus,
  JudgmentInput,
  LawArticleInput,
  LawNameEntry,
  LawSectionInput,
  LawVersionInput,
  Level,
  Outcome,
  SentenceInput,
  SpanInput,
  StructureKind,
  StructureNodeInput,
  StructureNodeRow,
};
