/**
 * 코퍼스 저장소.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 쿼리는 이 함수들 뒤에 둔다. 라우트 핸들러나 컴포넌트가
 * 테이블을 직접 만지지 않아야 `corpus`/`app` 양쪽에 같은 파이프라인을 쓸 수 있다.
 */

import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { CorpusDb } from "../client";
import {
  generationJob,
  judgment,
  judgmentSpan,
  lookupMiss,
  nodeSpan,
  rendition,
  renditionSentence,
  structureNode,
} from "./schema";

type Level = (typeof rendition.level.enumValues)[number];
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
  return db
    .select()
    .from(renditionSentence)
    .where(eq(renditionSentence.renditionId, renditionId))
    .orderBy(renditionSentence.orderIdx)
    .all();
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

/** 이 시간 동안 heartbeat가 없으면 죽은 작업으로 보고 회수한다. */
const STALE_AFTER_MS = 90_000;

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

function finishGenerationJob(
  db: CorpusDb,
  jobId: string,
  result: { ok: true } | { ok: false; error: string },
  now: Date = new Date(),
): void {
  db.update(generationJob)
    .set({
      status: result.ok ? "done" : "failed",
      error: result.ok ? null : result.error,
      finishedAt: now,
      heartbeatAt: now,
    })
    .where(eq(generationJob.id, jobId))
    .run();
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
 * 구조가 남고, 그것은 근거가 없는 것보다 나쁘다.
 */
function saveStructure(
  db: CorpusDb,
  judgmentId: string,
  nodes: readonly StructureNodeInput[],
): string[] {
  const valid = new Set(
    db
      .select({ id: judgmentSpan.id })
      .from(judgmentSpan)
      .where(eq(judgmentSpan.judgmentId, judgmentId))
      .all()
      .map((row) => row.id),
  );

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

  return db.transaction((tx) => {
    // 다시 추출하면 옛 구조를 남기지 않는다. node_span은 cascade로 함께 지워진다.
    tx.delete(structureNode).where(eq(structureNode.judgmentId, judgmentId)).run();
    if (nodes.length === 0) {
      return [];
    }

    const ids = nodes.map(() => newId());
    tx.insert(structureNode)
      .values(
        nodes.map((node, index) => ({
          id: ids[index] as string,
          judgmentId,
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
  });
}

/**
 * 구조 노드를 근거 span과 함께 읽는다.
 *
 * 노드마다 span을 따로 조회하지 않는다(§10.2 N+1 금지) — 판결문 하나에 노드가 수십 개고,
 * 레벨 렌더링은 그 전부를 한 번에 본다.
 */
function listStructureNodes(db: CorpusDb, judgmentId: string): StructureNodeRow[] {
  const nodes = db
    .select()
    .from(structureNode)
    .where(eq(structureNode.judgmentId, judgmentId))
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
  findJudgmentByCaseNo,
  findLatestRendition,
  findRendition,
  finishGenerationJob,
  heartbeatGenerationJob,
  listSentences,
  listSpans,
  listStructureNodes,
  recordLookupMiss,
  saveJudgmentText,
  saveRendition,
  saveStructure,
  STALE_AFTER_MS,
  upsertJudgment,
};
export type {
  ClaimResult,
  Confidence,
  JudgmentInput,
  Level,
  Outcome,
  SentenceInput,
  SpanInput,
  StructureKind,
  StructureNodeInput,
  StructureNodeRow,
};
