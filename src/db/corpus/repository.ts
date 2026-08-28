/**
 * 코퍼스 저장소.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 쿼리는 이 함수들 뒤에 둔다. 라우트 핸들러나 컴포넌트가
 * 테이블을 직접 만지지 않아야 `corpus`/`app` 양쪽에 같은 파이프라인을 쓸 수 있다.
 */

import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { CorpusDb } from "../client";
import {
  generationJob,
  judgment,
  judgmentSpan,
  lookupMiss,
  rendition,
  renditionSentence,
} from "./schema";

type Level = (typeof rendition.level.enumValues)[number];
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
  recordLookupMiss,
  saveJudgmentText,
  saveRendition,
  STALE_AFTER_MS,
  upsertJudgment,
};
export type { ClaimResult, Confidence, JudgmentInput, Level, Outcome, SentenceInput, SpanInput };
