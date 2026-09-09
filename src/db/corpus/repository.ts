/**
 * 코퍼스 저장소.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 쿼리는 이 함수들 뒤에 둔다. 라우트 핸들러나 컴포넌트가
 * 테이블을 직접 만지지 않아야 `corpus`/`app` 양쪽에 같은 파이프라인을 쓸 수 있다.
 */

import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import type { GenerationSnapshot } from "@/lib/generation-snapshot";
import type { JobOutcome } from "@/lib/job-outcome";
import { STALE_AFTER_MS } from "@/lib/timing";
import type { CorpusDb } from "../client";
import {
  audioUsage,
  contentRelease,
  contentReleaseRendition,
  generationJob,
  generationUsage,
  judgment,
  judgmentRevision,
  judgmentSpan,
  lawArticle,
  lawVersion,
  lookupMiss,
  nodeSpan,
  rendition,
  renditionAudio,
  renditionSentence,
  structureGenerationJob,
  structureNode,
} from "./schema";
import { searchLawIds } from "./search";

type Level = (typeof rendition.level.enumValues)[number];
type JobStage = (typeof generationJob.stage.enumValues)[number];
type JobStatus = (typeof generationJob.status.enumValues)[number];
type StructureKind = (typeof structureNode.kind.enumValues)[number];
type Confidence = (typeof renditionSentence.confidence.enumValues)[number];
type ReviewState = (typeof rendition.reviewState.enumValues)[number];
type Outcome = (typeof judgment.outcome.enumValues)[number];
type ReleaseState = "missing" | "draft" | "reviewing" | "published" | "stale" | "rejected";
type RenditionEditResult =
  | { readonly ok: true; readonly renditionId: string }
  | { readonly ok: false; readonly reason: "not_found" | "stale" | "invalid_sentences" };
type CorpusTransaction = Parameters<Parameters<CorpusDb["transaction"]>[0]>[0];
type RenditionRow = typeof rendition.$inferSelect;
type RenditionSentenceRow = typeof renditionSentence.$inferSelect;

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
  role?: "heading" | "body" | "gloss";
  text: string;
  structureNodeId?: string | null;
  confidence: Confidence;
  /** 낱말 뜻의 출처. 그 밖에는 null이다. */
  source?: string | null;
  checkReason?: string | null;
}

const newId = (): string => crypto.randomUUID();
const MAX_RENDITION_SENTENCE_LENGTH = 4000;

function findCurrentJudgmentRevisionId(db: CorpusDb, judgmentId: string): string | null {
  return (
    db
      .select({ revisionId: judgment.currentRevisionId })
      .from(judgment)
      .where(eq(judgment.id, judgmentId))
      .get()?.revisionId ?? null
  );
}

function listJudgmentRevisions(db: CorpusDb, judgmentId: string) {
  return db
    .select()
    .from(judgmentRevision)
    .where(eq(judgmentRevision.judgmentId, judgmentId))
    .orderBy(desc(judgmentRevision.createdAt))
    .all();
}

/** 이력 표는 본문을 전부 읽지 않고 각 원문판의 문장 수만 DB에서 센다. */
function listJudgmentRevisionSummaries(db: CorpusDb, judgmentId: string) {
  return db
    .select({
      id: judgmentRevision.id,
      judgmentId: judgmentRevision.judgmentId,
      contentHash: judgmentRevision.contentHash,
      fetchedAt: judgmentRevision.fetchedAt,
      createdAt: judgmentRevision.createdAt,
      spans: count(judgmentSpan.id),
    })
    .from(judgmentRevision)
    .leftJoin(
      judgmentSpan,
      and(
        eq(judgmentSpan.judgmentId, judgmentRevision.judgmentId),
        eq(judgmentSpan.revisionId, judgmentRevision.id),
      ),
    )
    .where(eq(judgmentRevision.judgmentId, judgmentId))
    .groupBy(judgmentRevision.id)
    .orderBy(desc(judgmentRevision.createdAt))
    .all();
}

function sourceRevision(
  db: CorpusDb,
  judgmentId: string,
  pinned: string | null | undefined,
): string | null {
  return pinned === undefined ? findCurrentJudgmentRevisionId(db, judgmentId) : pinned;
}

/** 기존 유일 키를 유지하면서 원문판까지 캐시 식별자에 포함한다. */
function versionForRevision(version: string, revisionId: string | null): string {
  return revisionId === null ? version : `${version}::source:${revisionId}`;
}

function contentHash(spans: readonly SpanInput[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        spans.map(({ paraIdx, sentIdx, charStart, charEnd, text }) => ({
          paraIdx,
          sentIdx,
          charStart,
          charEnd,
          text,
        })),
      ),
    )
    .digest("hex");
}

function findJudgmentByCaseNo(db: CorpusDb, caseNoCanonical: string) {
  return db.select().from(judgment).where(eq(judgment.caseNoCanonical, caseNoCanonical)).get();
}

function findJudgmentById(db: CorpusDb, judgmentId: string) {
  return db.select().from(judgment).where(eq(judgment.id, judgmentId)).get();
}

/** app DB의 신고 목록에 붙일 공개 판결문 이름을 한 질의로 읽는다. */
function listJudgmentIdentities(db: CorpusDb, judgmentIds: readonly string[]) {
  if (judgmentIds.length === 0) {
    return [];
  }
  return db
    .select({
      id: judgment.id,
      caseNoCanonical: judgment.caseNoCanonical,
      caseNoDisplay: judgment.caseNoDisplay,
    })
    .from(judgment)
    .where(inArray(judgment.id, [...new Set(judgmentIds)]))
    .all();
}

function findJudgmentRevision(db: CorpusDb, judgmentId: string, revisionId: string) {
  return db
    .select()
    .from(judgmentRevision)
    .where(and(eq(judgmentRevision.id, revisionId), eq(judgmentRevision.judgmentId, judgmentId)))
    .get();
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
function saveJudgmentText(
  db: CorpusDb,
  judgmentId: string,
  spans: readonly SpanInput[],
): { readonly revisionId: string; readonly created: boolean } {
  const hash = contentHash(spans);
  return db.transaction(
    (tx) => {
      const existing = tx
        .select({ id: judgmentRevision.id })
        .from(judgmentRevision)
        .where(
          and(eq(judgmentRevision.judgmentId, judgmentId), eq(judgmentRevision.contentHash, hash)),
        )
        .get();
      if (existing !== undefined) {
        tx.update(judgment)
          .set({ currentRevisionId: existing.id, textCachedAt: new Date() })
          .where(eq(judgment.id, judgmentId))
          .run();
        return { revisionId: existing.id, created: false };
      }

      const revisionId = newId();
      const fetchedAt = new Date();
      tx.insert(judgmentRevision)
        .values({ id: revisionId, judgmentId, contentHash: hash, fetchedAt })
        .run();
      if (spans.length > 0) {
        tx.insert(judgmentSpan)
          .values(spans.map((span) => ({ id: newId(), judgmentId, revisionId, ...span })))
          .run();
      }
      tx.update(judgment)
        .set({ currentRevisionId: revisionId, textCachedAt: fetchedAt })
        .where(eq(judgment.id, judgmentId))
        .run();
      return { revisionId, created: true };
    },
    { behavior: "immediate" },
  );
}

function listSpans(db: CorpusDb, judgmentId: string, pinnedRevisionId?: string | null) {
  const revisionId = sourceRevision(db, judgmentId, pinnedRevisionId);
  return db
    .select()
    .from(judgmentSpan)
    .where(
      revisionId === null
        ? and(eq(judgmentSpan.judgmentId, judgmentId), isNull(judgmentSpan.revisionId))
        : and(eq(judgmentSpan.judgmentId, judgmentId), eq(judgmentSpan.revisionId, revisionId)),
    )
    .orderBy(judgmentSpan.paraIdx, judgmentSpan.sentIdx)
    .all();
}

/** 이 레벨·프롬프트 버전의 변환본이 이미 있는가. 있으면 생성하지 않는다. */
function findRendition(db: CorpusDb, judgmentId: string, level: Level, promptVersion: string) {
  return findRenditionAtRevision(db, {
    judgmentId,
    level,
    promptVersion,
    sourceRevisionId: findCurrentJudgmentRevisionId(db, judgmentId),
  });
}

function findRenditionAtRevision(
  db: CorpusDb,
  input: {
    judgmentId: string;
    level: Level;
    promptVersion: string;
    sourceRevisionId: string | null;
  },
) {
  return db
    .select()
    .from(rendition)
    .where(
      and(
        eq(rendition.judgmentId, input.judgmentId),
        eq(rendition.level, input.level),
        eq(
          rendition.promptVersion,
          versionForRevision(input.promptVersion, input.sourceRevisionId),
        ),
        input.sourceRevisionId === null
          ? isNull(rendition.sourceRevisionId)
          : eq(rendition.sourceRevisionId, input.sourceRevisionId),
      ),
    )
    .get();
}

/** 프롬프트 버전을 가리지 않고 가장 최근 것. 오래된 버전이라도 보여 주고 재생성을 권한다. */
function findLatestRendition(
  db: CorpusDb,
  judgmentId: string,
  level: Level,
  pinnedRevisionId?: string | null,
) {
  const revisionId = sourceRevision(db, judgmentId, pinnedRevisionId);
  return db
    .select()
    .from(rendition)
    .where(
      and(
        eq(rendition.judgmentId, judgmentId),
        eq(rendition.level, level),
        revisionId === null
          ? isNull(rendition.sourceRevisionId)
          : eq(rendition.sourceRevisionId, revisionId),
      ),
    )
    .orderBy(desc(rendition.generatedAt))
    .get();
}

function findRenditionById(db: CorpusDb, judgmentId: string, renditionId: string) {
  return db
    .select()
    .from(rendition)
    .where(and(eq(rendition.id, renditionId), eq(rendition.judgmentId, judgmentId)))
    .get();
}

/** 현재 원문판에서 사람이 승인한 편집본. 자동 생성 설정이 바뀌어도 승인본은 유효하다. */
function findApprovedRendition(
  db: CorpusDb,
  judgmentId: string,
  level: Level,
  pinnedRevisionId?: string | null,
) {
  const revisionId = sourceRevision(db, judgmentId, pinnedRevisionId);
  return db
    .select()
    .from(rendition)
    .where(
      and(
        eq(rendition.judgmentId, judgmentId),
        eq(rendition.level, level),
        eq(rendition.reviewState, "approved"),
        revisionId === null
          ? isNull(rendition.sourceRevisionId)
          : eq(rendition.sourceRevisionId, revisionId),
      ),
    )
    .orderBy(desc(rendition.generatedAt))
    .get();
}

/**
 * 현재 공개 릴리스가 가리키는 변환본.
 *
 * 승인 상태만으로 공개하지 않는다. 판결문의 공개 포인터, 릴리스의 원문판, 변환본의
 * 원문판과 레벨이 모두 맞아야 한다. 원문 포인터가 바뀌는 순간 옛 설명이 자동으로
 * 조회되지 않는 이유도 이 네 조건에 있다.
 */
function findPublishedRendition(db: CorpusDb, judgmentId: string, level: Level) {
  const owner = db
    .select({
      currentRevisionId: judgment.currentRevisionId,
      currentContentReleaseId: judgment.currentContentReleaseId,
    })
    .from(judgment)
    .where(eq(judgment.id, judgmentId))
    .get();
  if (
    owner === undefined ||
    owner.currentRevisionId === null ||
    owner.currentContentReleaseId === null
  ) {
    return;
  }

  return db
    .select({ rendition })
    .from(contentRelease)
    .innerJoin(contentReleaseRendition, eq(contentReleaseRendition.releaseId, contentRelease.id))
    .innerJoin(rendition, eq(rendition.id, contentReleaseRendition.renditionId))
    .where(
      and(
        eq(contentRelease.id, owner.currentContentReleaseId),
        eq(contentRelease.judgmentId, judgmentId),
        eq(contentRelease.sourceRevisionId, owner.currentRevisionId),
        eq(contentReleaseRendition.level, level),
        eq(rendition.judgmentId, judgmentId),
        eq(rendition.sourceRevisionId, owner.currentRevisionId),
        eq(rendition.level, level),
        eq(rendition.reviewState, "approved"),
      ),
    )
    .get()?.rendition;
}

/** 신고가 현재 공개 중인 정확한 문장에서 왔는지 확인하고 불변 식별자를 함께 돌려준다. */
function findPublishedSentenceContext(db: CorpusDb, sentenceId: string) {
  return db
    .select({
      judgmentId: judgment.id,
      sourceRevisionId: contentRelease.sourceRevisionId,
      contentReleaseId: contentRelease.id,
      renditionId: rendition.id,
      sentenceId: renditionSentence.id,
    })
    .from(renditionSentence)
    .innerJoin(rendition, eq(rendition.id, renditionSentence.renditionId))
    .innerJoin(judgment, eq(judgment.id, rendition.judgmentId))
    .innerJoin(contentReleaseRendition, eq(contentReleaseRendition.renditionId, rendition.id))
    .innerJoin(contentRelease, eq(contentRelease.id, contentReleaseRendition.releaseId))
    .where(
      and(
        eq(renditionSentence.id, sentenceId),
        eq(judgment.currentContentReleaseId, contentRelease.id),
        eq(judgment.currentRevisionId, contentRelease.sourceRevisionId),
        eq(rendition.sourceRevisionId, contentRelease.sourceRevisionId),
        eq(rendition.reviewState, "approved"),
      ),
    )
    .get();
}

/** 현재 공개 릴리스에 든 문장의 음성만 돌려준다. */
function findPublishedAudio(db: CorpusDb, sentenceId: string) {
  return db
    .select({ bytes: renditionAudio.bytes, format: renditionAudio.format })
    .from(renditionAudio)
    .innerJoin(renditionSentence, eq(renditionSentence.id, renditionAudio.sentenceId))
    .innerJoin(rendition, eq(rendition.id, renditionSentence.renditionId))
    .innerJoin(judgment, eq(judgment.id, rendition.judgmentId))
    .innerJoin(contentReleaseRendition, eq(contentReleaseRendition.renditionId, rendition.id))
    .innerJoin(
      contentRelease,
      and(
        eq(contentRelease.id, contentReleaseRendition.releaseId),
        eq(contentRelease.id, judgment.currentContentReleaseId),
      ),
    )
    .where(
      and(
        eq(renditionAudio.sentenceId, sentenceId),
        eq(rendition.reviewState, "approved"),
        eq(rendition.sourceRevisionId, judgment.currentRevisionId),
        eq(contentRelease.sourceRevisionId, judgment.currentRevisionId),
      ),
    )
    .get();
}

type ReleaseMutationResult =
  | { readonly ok: true; readonly changed: boolean; readonly releaseId: string | null }
  | {
      readonly ok: false;
      readonly reason:
        | "not_found"
        | "no_source_revision"
        | "stale"
        | "empty"
        | "ungrounded"
        | "not_approved"
        | "invalid_review_state";
    };

type ReviewMutationResult = ReleaseMutationResult;

/** 현재 원문판의 설명만 검수 상태를 바꾼다. 승인에는 문장·근거 검사를 함께 적용한다. */
function reviewRendition(
  db: CorpusDb,
  input: { judgmentId: string; renditionId: string; state: "pending" | "approved" | "rejected" },
): ReviewMutationResult {
  const owner = db
    .select({ currentRevisionId: judgment.currentRevisionId })
    .from(judgment)
    .where(eq(judgment.id, input.judgmentId))
    .get();
  const selected = db
    .select()
    .from(rendition)
    .where(and(eq(rendition.id, input.renditionId), eq(rendition.judgmentId, input.judgmentId)))
    .get();
  if (owner === undefined || selected === undefined) {
    return { ok: false, reason: "not_found" };
  }
  if (owner.currentRevisionId === null) {
    return { ok: false, reason: "no_source_revision" };
  }
  if (selected.sourceRevisionId !== owner.currentRevisionId) {
    return { ok: false, reason: "stale" };
  }
  const sentences = db
    .select({ confidence: renditionSentence.confidence })
    .from(renditionSentence)
    .where(eq(renditionSentence.renditionId, selected.id))
    .all();
  if (sentences.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (
    input.state === "approved" &&
    sentences.some(({ confidence }) => confidence === "ungrounded")
  ) {
    return { ok: false, reason: "ungrounded" };
  }
  if (selected.reviewState === input.state) {
    return { ok: true, changed: false, releaseId: null };
  }
  const mayRequest =
    input.state === "pending" &&
    (selected.reviewState === "none" || selected.reviewState === "rejected");
  const mayDecide =
    (input.state === "approved" || input.state === "rejected") &&
    selected.reviewState === "pending";
  if (!(mayRequest || mayDecide)) {
    return { ok: false, reason: "invalid_review_state" };
  }
  db.update(rendition).set({ reviewState: input.state }).where(eq(rendition.id, selected.id)).run();
  return { ok: true, changed: true, releaseId: null };
}

function sameReleaseItems(
  left: readonly { level: Level; renditionId: string }[],
  right: readonly { level: Level; renditionId: string }[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item) =>
      right.some((other) => other.level === item.level && other.renditionId === item.renditionId),
    )
  );
}

function insertContentRelease(
  tx: Pick<CorpusDb, "insert" | "update">,
  input: {
    judgmentId: string;
    sourceRevisionId: string;
    action: "publish" | "withdraw" | "restore";
    actorId?: string | null;
    items: readonly { level: Level; renditionId: string }[];
  },
): string {
  const releaseId = newId();
  tx.insert(contentRelease)
    .values({
      id: releaseId,
      judgmentId: input.judgmentId,
      sourceRevisionId: input.sourceRevisionId,
      action: input.action,
      actorId: input.actorId ?? null,
    })
    .run();
  if (input.items.length > 0) {
    tx.insert(contentReleaseRendition)
      .values(input.items.map((item) => ({ releaseId, ...item })))
      .run();
  }
  tx.update(judgment)
    .set({ currentContentReleaseId: releaseId })
    .where(eq(judgment.id, input.judgmentId))
    .run();
  return releaseId;
}

/** 현재 릴리스에서 그대로 이어 갈 레벨별 변환본을 읽는다. */
function activeReleaseItems(
  db: Pick<CorpusDb, "select">,
  input: { judgmentId: string; releaseId: string | null; sourceRevisionId: string },
) {
  if (input.releaseId === null) {
    return [];
  }
  const release = db
    .select({ id: contentRelease.id })
    .from(contentRelease)
    .where(
      and(
        eq(contentRelease.id, input.releaseId),
        eq(contentRelease.judgmentId, input.judgmentId),
        eq(contentRelease.sourceRevisionId, input.sourceRevisionId),
      ),
    )
    .get();
  if (release === undefined) {
    return [];
  }
  return db
    .select({
      level: contentReleaseRendition.level,
      renditionId: contentReleaseRendition.renditionId,
    })
    .from(contentReleaseRendition)
    .where(eq(contentReleaseRendition.releaseId, release.id))
    .all();
}

/** 검수한 변환본을 기존 공개 레벨들과 함께 새 불변 릴리스로 게시한다. */
function publishRendition(
  db: CorpusDb,
  input: { judgmentId: string; renditionId: string; actorId?: string | null },
): ReleaseMutationResult {
  return db.transaction(
    (tx) => {
      const owner = tx
        .select({
          currentRevisionId: judgment.currentRevisionId,
          currentContentReleaseId: judgment.currentContentReleaseId,
        })
        .from(judgment)
        .where(eq(judgment.id, input.judgmentId))
        .get();
      const selected = tx
        .select()
        .from(rendition)
        .where(and(eq(rendition.id, input.renditionId), eq(rendition.judgmentId, input.judgmentId)))
        .get();
      if (owner === undefined || selected === undefined) {
        return { ok: false, reason: "not_found" } as const;
      }
      if (owner.currentRevisionId === null) {
        return { ok: false, reason: "no_source_revision" } as const;
      }
      if (selected.sourceRevisionId !== owner.currentRevisionId) {
        return { ok: false, reason: "stale" } as const;
      }
      if (selected.reviewState !== "approved") {
        return { ok: false, reason: "not_approved" } as const;
      }

      const sentences = tx
        .select({ confidence: renditionSentence.confidence })
        .from(renditionSentence)
        .where(eq(renditionSentence.renditionId, selected.id))
        .all();
      if (sentences.length === 0) {
        return { ok: false, reason: "empty" } as const;
      }
      if (sentences.some(({ confidence }) => confidence === "ungrounded")) {
        return { ok: false, reason: "ungrounded" } as const;
      }

      const previous = activeReleaseItems(tx, {
        judgmentId: input.judgmentId,
        releaseId: owner.currentContentReleaseId,
        sourceRevisionId: owner.currentRevisionId,
      });
      if (previous.find(({ level }) => level === selected.level)?.renditionId === selected.id) {
        return { ok: true, changed: false, releaseId: owner.currentContentReleaseId } as const;
      }

      const items = [
        ...previous.filter(({ level }) => level !== selected.level),
        { level: selected.level, renditionId: selected.id },
      ];
      const releaseId = insertContentRelease(tx, {
        judgmentId: input.judgmentId,
        sourceRevisionId: owner.currentRevisionId,
        action: "publish",
        actorId: input.actorId,
        items,
      });
      return { ok: true, changed: true, releaseId } as const;
    },
    { behavior: "immediate" },
  );
}

/** 한 레벨을 빼고 새 릴리스를 만든다. 빈 묶음도 남겨 철회 이력을 보존한다. */
function withdrawPublishedRendition(
  db: CorpusDb,
  input: { judgmentId: string; level: Level; actorId?: string | null },
): ReleaseMutationResult {
  return db.transaction(
    (tx) => {
      const owner = tx
        .select({
          currentRevisionId: judgment.currentRevisionId,
          currentContentReleaseId: judgment.currentContentReleaseId,
        })
        .from(judgment)
        .where(eq(judgment.id, input.judgmentId))
        .get();
      if (owner === undefined) {
        return { ok: false, reason: "not_found" } as const;
      }
      if (owner.currentRevisionId === null) {
        return { ok: false, reason: "no_source_revision" } as const;
      }
      const previous = activeReleaseItems(tx, {
        judgmentId: input.judgmentId,
        releaseId: owner.currentContentReleaseId,
        sourceRevisionId: owner.currentRevisionId,
      });
      if (!previous.some(({ level }) => level === input.level)) {
        return { ok: true, changed: false, releaseId: owner.currentContentReleaseId } as const;
      }

      const items = previous.filter(({ level }) => level !== input.level);
      const releaseId = insertContentRelease(tx, {
        judgmentId: input.judgmentId,
        sourceRevisionId: owner.currentRevisionId,
        action: "withdraw",
        actorId: input.actorId,
        items,
      });
      return { ok: true, changed: true, releaseId } as const;
    },
    { behavior: "immediate" },
  );
}

/** 현재 원문판의 과거 공개 묶음을 복사해 새 복원 릴리스로 전환한다. */
function restoreContentRelease(
  db: CorpusDb,
  input: { judgmentId: string; releaseId: string; actorId?: string | null },
): ReleaseMutationResult {
  return db.transaction(
    (tx) => {
      const owner = tx
        .select({
          currentRevisionId: judgment.currentRevisionId,
          currentContentReleaseId: judgment.currentContentReleaseId,
        })
        .from(judgment)
        .where(eq(judgment.id, input.judgmentId))
        .get();
      if (owner === undefined) {
        return { ok: false, reason: "not_found" } as const;
      }
      if (owner.currentRevisionId === null) {
        return { ok: false, reason: "no_source_revision" } as const;
      }
      const source = tx
        .select({ id: contentRelease.id })
        .from(contentRelease)
        .where(
          and(
            eq(contentRelease.id, input.releaseId),
            eq(contentRelease.judgmentId, input.judgmentId),
            eq(contentRelease.sourceRevisionId, owner.currentRevisionId),
          ),
        )
        .get();
      if (source === undefined) {
        return { ok: false, reason: "stale" } as const;
      }
      const items = activeReleaseItems(tx, {
        judgmentId: input.judgmentId,
        releaseId: source.id,
        sourceRevisionId: owner.currentRevisionId,
      });
      const current = activeReleaseItems(tx, {
        judgmentId: input.judgmentId,
        releaseId: owner.currentContentReleaseId,
        sourceRevisionId: owner.currentRevisionId,
      });
      if (sameReleaseItems(items, current)) {
        return { ok: true, changed: false, releaseId: owner.currentContentReleaseId } as const;
      }

      const releaseId = insertContentRelease(tx, {
        judgmentId: input.judgmentId,
        sourceRevisionId: owner.currentRevisionId,
        action: "restore",
        actorId: input.actorId,
        items,
      });
      return { ok: true, changed: true, releaseId } as const;
    },
    { behavior: "immediate" },
  );
}

interface RenditionReleaseOverview {
  readonly level: Level;
  readonly state: ReleaseState;
  readonly latest: ReturnType<typeof findLatestRendition>;
  readonly publishedRenditionId: string | null;
  readonly sentences: number;
  readonly needsCheck: number;
  readonly ungrounded: number;
}

/** 관리자 화면의 네 레벨 상태. 쿼리 수는 레벨 수와 무관하게 고정한다. */
function listRenditionReleaseOverview(
  db: CorpusDb,
  judgmentId: string,
): RenditionReleaseOverview[] {
  const owner = db
    .select({
      currentRevisionId: judgment.currentRevisionId,
      currentContentReleaseId: judgment.currentContentReleaseId,
    })
    .from(judgment)
    .where(eq(judgment.id, judgmentId))
    .get();
  const all = db
    .select()
    .from(rendition)
    .where(eq(rendition.judgmentId, judgmentId))
    .orderBy(desc(rendition.generatedAt))
    .all();
  const current = all.filter(
    ({ sourceRevisionId }) => sourceRevisionId === owner?.currentRevisionId,
  );
  const latestByLevel = new Map<Level, (typeof all)[number]>();
  for (const row of current) {
    if (!latestByLevel.has(row.level)) {
      latestByLevel.set(row.level, row);
    }
  }
  const latestIds = [...latestByLevel.values()].map(({ id }) => id);
  const stats = new Map<string, { sentences: number; needsCheck: number; ungrounded: number }>();
  if (latestIds.length > 0) {
    for (const sentence of db
      .select({
        renditionId: renditionSentence.renditionId,
        confidence: renditionSentence.confidence,
      })
      .from(renditionSentence)
      .where(inArray(renditionSentence.renditionId, latestIds))
      .all()) {
      const value = stats.get(sentence.renditionId) ?? {
        sentences: 0,
        needsCheck: 0,
        ungrounded: 0,
      };
      value.sentences += 1;
      if (sentence.confidence === "needs_check") {
        value.needsCheck += 1;
      }
      if (sentence.confidence === "ungrounded") {
        value.ungrounded += 1;
      }
      stats.set(sentence.renditionId, value);
    }
  }
  const published = new Map(
    owner?.currentRevisionId === null || owner === undefined
      ? []
      : activeReleaseItems(db, {
          judgmentId,
          releaseId: owner.currentContentReleaseId,
          sourceRevisionId: owner.currentRevisionId,
        }).map(({ level, renditionId }) => [level, renditionId] as const),
  );

  const levels: readonly Level[] = ["L1", "L2", "L3", "L4"];
  return levels.map((level) => {
    const latest = latestByLevel.get(level);
    const publishedRenditionId = published.get(level) ?? null;
    let state: ReleaseState;
    if (publishedRenditionId !== null) {
      state = "published";
    } else if (latest?.reviewState === "pending") {
      state = "reviewing";
    } else if (latest?.reviewState === "rejected") {
      state = "rejected";
    } else if (latest !== undefined) {
      state = "draft";
    } else if (all.some((row) => row.level === level)) {
      state = "stale";
    } else {
      state = "missing";
    }
    return {
      level,
      state,
      latest,
      publishedRenditionId,
      ...(latest === undefined
        ? { sentences: 0, needsCheck: 0, ungrounded: 0 }
        : (stats.get(latest.id) ?? { sentences: 0, needsCheck: 0, ungrounded: 0 })),
    };
  });
}

function listContentReleases(db: CorpusDb, judgmentId: string) {
  const releases = db
    .select()
    .from(contentRelease)
    .where(eq(contentRelease.judgmentId, judgmentId))
    .orderBy(desc(contentRelease.createdAt))
    .all();
  const ids = releases.map(({ id }) => id);
  const items =
    ids.length === 0
      ? []
      : db
          .select({
            releaseId: contentReleaseRendition.releaseId,
            level: contentReleaseRendition.level,
          })
          .from(contentReleaseRendition)
          .where(inArray(contentReleaseRendition.releaseId, ids))
          .all();
  return releases.map((release) => ({
    ...release,
    levels: items.filter(({ releaseId }) => releaseId === release.id).map(({ level }) => level),
  }));
}

/** 릴리스 비교·감사에 쓰는 정확한 레벨별 변환본과 문장 묶음. */
function findContentReleaseBundle(db: CorpusDb, judgmentId: string, releaseId: string) {
  const release = db
    .select()
    .from(contentRelease)
    .where(and(eq(contentRelease.id, releaseId), eq(contentRelease.judgmentId, judgmentId)))
    .get();
  if (release === undefined) {
    return;
  }
  const items = db
    .select({
      level: contentReleaseRendition.level,
      renditionId: contentReleaseRendition.renditionId,
      generatedAt: rendition.generatedAt,
    })
    .from(contentReleaseRendition)
    .innerJoin(rendition, eq(rendition.id, contentReleaseRendition.renditionId))
    .where(
      and(eq(contentReleaseRendition.releaseId, releaseId), eq(rendition.judgmentId, judgmentId)),
    )
    .orderBy(contentReleaseRendition.level)
    .all();
  const renditionIds = items.map(({ renditionId }) => renditionId);
  const sentences =
    renditionIds.length === 0
      ? []
      : db
          .select({
            id: renditionSentence.id,
            renditionId: renditionSentence.renditionId,
            orderIdx: renditionSentence.orderIdx,
            role: renditionSentence.role,
            text: renditionSentence.text,
          })
          .from(renditionSentence)
          .where(inArray(renditionSentence.renditionId, renditionIds))
          .orderBy(renditionSentence.renditionId, renditionSentence.orderIdx)
          .all();
  return {
    ...release,
    renditions: items.map((item) => ({
      ...item,
      sentences: sentences.filter(({ renditionId }) => renditionId === item.renditionId),
    })),
  };
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

/** app DB 신고 행에 붙일 문장 본문과 레벨을 한 번에 읽는다. */
function listReportedSentenceDetails(db: CorpusDb, sentenceIds: readonly string[]) {
  if (sentenceIds.length === 0) {
    return [];
  }
  return db
    .select({ id: renditionSentence.id, text: renditionSentence.text, level: rendition.level })
    .from(renditionSentence)
    .innerJoin(rendition, eq(rendition.id, renditionSentence.renditionId))
    .where(inArray(renditionSentence.id, sentenceIds))
    .all();
}

function saveRendition(
  db: CorpusDb,
  input: {
    judgmentId: string;
    level: Level;
    model: string;
    promptVersion: string;
    generationSnapshot?: GenerationSnapshot;
    reviewState?: ReviewState;
    sentences: readonly SentenceInput[];
    sourceRevisionId?: string | null;
  },
): string {
  const revisionId = sourceRevision(db, input.judgmentId, input.sourceRevisionId);
  return db.transaction((tx) => {
    const id = newId();
    tx.insert(rendition)
      .values({
        id,
        judgmentId: input.judgmentId,
        sourceRevisionId: revisionId,
        level: input.level,
        model: input.model,
        promptVersion: versionForRevision(input.promptVersion, revisionId),
        generationSnapshot: input.generationSnapshot,
        reviewState: input.reviewState ?? "none",
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
            source: sentence.source ?? null,
            checkReason: sentence.checkReason ?? null,
          })),
        )
        .run();
    }
    return id;
  });
}

function findEditTarget(
  tx: CorpusTransaction,
  judgmentId: string,
  renditionId: string,
): { owner: typeof judgment.$inferSelect | undefined; base: RenditionRow | undefined } {
  const owner = tx.select().from(judgment).where(eq(judgment.id, judgmentId)).get();
  const base = tx
    .select()
    .from(rendition)
    .where(and(eq(rendition.id, renditionId), eq(rendition.judgmentId, judgmentId)))
    .get();
  return { owner, base };
}

function validSentenceEdits(
  existing: readonly RenditionSentenceRow[],
  sentences: readonly { id: string; text: string }[],
): ReadonlyMap<string, string> | undefined {
  const edits = new Map(sentences.map((sentence) => [sentence.id, sentence.text.trim()]));
  const valid =
    existing.length > 0 &&
    edits.size === existing.length &&
    existing.some((sentence) => edits.get(sentence.id) !== sentence.text) &&
    existing.every((sentence) => {
      const text = edits.get(sentence.id);
      return (
        text !== undefined &&
        text.length > 0 &&
        text.length <= MAX_RENDITION_SENTENCE_LENGTH &&
        !(sentence.role === "gloss" && text !== sentence.text)
      );
    });
  return valid ? edits : undefined;
}

function insertEditedRendition(
  tx: CorpusTransaction,
  base: RenditionRow,
  existing: readonly RenditionSentenceRow[],
  edits: ReadonlyMap<string, string>,
): string {
  const renditionId = newId();
  const generatedAt = new Date(Math.max(Date.now(), base.generatedAt.getTime() + 1));
  tx.insert(rendition)
    .values({
      id: renditionId,
      judgmentId: base.judgmentId,
      sourceRevisionId: base.sourceRevisionId,
      level: base.level,
      model: "human-editor",
      promptVersion: versionForRevision(`editorial:${renditionId}`, base.sourceRevisionId),
      generationSnapshot: base.generationSnapshot,
      reviewState: "none",
      generatedAt,
    })
    .run();
  tx.insert(renditionSentence)
    .values(
      existing.map((sentence) => {
        const text = edits.get(sentence.id) as string;
        const changed = text !== sentence.text;
        return {
          id: newId(),
          renditionId,
          orderIdx: sentence.orderIdx,
          role: sentence.role,
          text,
          structureNodeId: sentence.structureNodeId,
          source: sentence.source,
          confidence: changed ? ("needs_check" as const) : sentence.confidence,
          checkReason: changed ? "사람이 고친 문장을 원문과 대조해야 해요." : sentence.checkReason,
        };
      }),
    )
    .run();
  return renditionId;
}

/** 기존 설명을 고쳐도 그 행을 덮지 않고, 같은 근거 연결을 가진 새 초안 UUID를 만든다. */
function createEditedRendition(
  db: CorpusDb,
  input: {
    judgmentId: string;
    baseRenditionId: string;
    sentences: readonly { id: string; text: string }[];
  },
): RenditionEditResult {
  return db.transaction((tx) => {
    const { owner, base } = findEditTarget(tx, input.judgmentId, input.baseRenditionId);
    if (owner === undefined || base === undefined) {
      return { ok: false, reason: "not_found" } as const;
    }
    if (owner.currentRevisionId === null || base.sourceRevisionId !== owner.currentRevisionId) {
      return { ok: false, reason: "stale" } as const;
    }
    const existing = tx
      .select()
      .from(renditionSentence)
      .where(eq(renditionSentence.renditionId, base.id))
      .orderBy(renditionSentence.orderIdx)
      .all();
    const edits = validSentenceEdits(existing, input.sentences);
    if (edits === undefined) {
      return { ok: false, reason: "invalid_sentences" } as const;
    }

    const renditionId = insertEditedRendition(tx, base, existing, edits);
    return { ok: true, renditionId } as const;
  });
}

type ClaimResult =
  /** 내가 선점했다. 파이프라인을 돌려도 된다. */
  | { readonly kind: "claimed"; readonly jobId: string }
  /** 다른 요청이 이미 만들고 있다. 새로 만들지 말고 이 작업을 지켜본다. */
  | { readonly kind: "running"; readonly jobId: string }
  /** 이미 끝났다. 변환본을 읽으면 된다. */
  | { readonly kind: "done"; readonly jobId: string };

function insertStructureClaim(
  db: CorpusDb,
  input: {
    judgmentId: string;
    sourceRevisionId: string | null;
    promptVersion: string;
    workerId: string;
    now: Date;
  },
): string | undefined {
  const rows = db
    .insert(structureGenerationJob)
    .values({
      id: newId(),
      judgmentId: input.judgmentId,
      sourceRevisionId: input.sourceRevisionId,
      promptVersion: versionForRevision(input.promptVersion, input.sourceRevisionId),
      status: "running",
      claimedBy: input.workerId,
      heartbeatAt: input.now,
      attempts: 1,
    })
    .onConflictDoNothing()
    .returning({ id: structureGenerationJob.id })
    .all();
  return rows[0]?.id;
}

function findStructureJob(
  db: CorpusDb,
  input: { judgmentId: string; sourceRevisionId: string | null; promptVersion: string },
) {
  return db
    .select()
    .from(structureGenerationJob)
    .where(
      and(
        eq(structureGenerationJob.judgmentId, input.judgmentId),
        eq(
          structureGenerationJob.promptVersion,
          versionForRevision(input.promptVersion, input.sourceRevisionId),
        ),
        input.sourceRevisionId === null
          ? isNull(structureGenerationJob.sourceRevisionId)
          : eq(structureGenerationJob.sourceRevisionId, input.sourceRevisionId),
      ),
    )
    .get();
}

function reclaimStructureJob(
  db: CorpusDb,
  input: {
    job: { id: string; attempts: number };
    workerId: string;
    now: Date;
  },
): boolean {
  const staleBefore = new Date(input.now.getTime() - STALE_AFTER_MS);
  return (
    db
      .update(structureGenerationJob)
      .set({
        status: "running",
        claimedBy: input.workerId,
        heartbeatAt: input.now,
        attempts: input.job.attempts + 1,
        error: null,
        detail: null,
        finishedAt: null,
      })
      .where(
        and(
          eq(structureGenerationJob.id, input.job.id),
          or(
            eq(structureGenerationJob.status, "failed"),
            lt(structureGenerationJob.heartbeatAt, staleBefore),
          ),
        ),
      )
      .returning({ id: structureGenerationJob.id })
      .all().length > 0
  );
}

/** 원문판·추출 프롬프트별 구조 추출을 선점한다. 레벨은 이 키에 들어가지 않는다. */
function claimStructureGenerationJob(
  db: CorpusDb,
  input: {
    judgmentId: string;
    sourceRevisionId?: string | null;
    promptVersion: string;
    workerId: string;
    now?: Date;
  },
): ClaimResult {
  const now = input.now ?? new Date();
  const revisionId = sourceRevision(db, input.judgmentId, input.sourceRevisionId);
  const claimedId = insertStructureClaim(db, { ...input, sourceRevisionId: revisionId, now });
  if (claimedId !== undefined) {
    return { kind: "claimed", jobId: claimedId };
  }

  const existing = findStructureJob(db, {
    judgmentId: input.judgmentId,
    sourceRevisionId: revisionId,
    promptVersion: input.promptVersion,
  });
  if (existing === undefined) {
    return claimStructureGenerationJob(db, { ...input, sourceRevisionId: revisionId, now });
  }
  if (existing.status === "done") {
    return { kind: "done", jobId: existing.id };
  }
  if (reclaimStructureJob(db, { job: existing, workerId: input.workerId, now })) {
    return { kind: "claimed", jobId: existing.id };
  }
  return { kind: "running", jobId: existing.id };
}

function heartbeatStructureGenerationJob(
  db: CorpusDb,
  jobId: string,
  now: Date = new Date(),
): void {
  db.update(structureGenerationJob)
    .set({ heartbeatAt: now })
    .where(and(eq(structureGenerationJob.id, jobId), eq(structureGenerationJob.status, "running")))
    .run();
}

function finishStructureGenerationJob(
  db: CorpusDb,
  jobId: string,
  result: JobOutcome,
  now: Date = new Date(),
): void {
  db.update(structureGenerationJob)
    .set({
      status: result.ok ? "done" : "failed",
      error: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail,
      heartbeatAt: now,
      finishedAt: now,
    })
    .where(eq(structureGenerationJob.id, jobId))
    .run();
}

/* 좀비 판정 기준은 `lib/timing.ts` 하나뿐이다. 여기서 따로 정하면 어긋난다. */

/** 새 작업을 만들어 선점을 시도한다. 이미 있으면 아무 일도 하지 않고 undefined를 낸다. */
function insertClaim(
  db: CorpusDb,
  input: {
    judgmentId: string;
    sourceRevisionId: string | null;
    level: Level;
    promptVersion: string;
    generationSnapshot?: GenerationSnapshot;
    workerId: string;
    now: Date;
  },
): string | undefined {
  const rows = db
    .insert(generationJob)
    .values({
      id: newId(),
      judgmentId: input.judgmentId,
      sourceRevisionId: input.sourceRevisionId,
      level: input.level,
      promptVersion: versionForRevision(input.promptVersion, input.sourceRevisionId),
      generationSnapshot: input.generationSnapshot,
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

function findJob(
  db: CorpusDb,
  input: {
    judgmentId: string;
    sourceRevisionId: string | null;
    level: Level;
    promptVersion: string;
  },
) {
  return db
    .select()
    .from(generationJob)
    .where(
      and(
        eq(generationJob.judgmentId, input.judgmentId),
        eq(generationJob.level, input.level),
        eq(
          generationJob.promptVersion,
          versionForRevision(input.promptVersion, input.sourceRevisionId),
        ),
        input.sourceRevisionId === null
          ? isNull(generationJob.sourceRevisionId)
          : eq(generationJob.sourceRevisionId, input.sourceRevisionId),
      ),
    )
    .get();
}

/** 실패했거나 heartbeat가 멈춘 작업만 회수한다. 조건을 UPDATE에 담아 경합을 DB가 판정하게 한다. */
function reclaimJob(
  db: CorpusDb,
  input: {
    job: { id: string; attempts: number };
    workerId: string;
    now: Date;
    generationSnapshot?: GenerationSnapshot;
  },
): boolean {
  const staleBefore = new Date(input.now.getTime() - STALE_AFTER_MS);
  const rows = db
    .update(generationJob)
    .set({
      status: "running",
      claimedBy: input.workerId,
      heartbeatAt: input.now,
      generationSnapshot: input.generationSnapshot,
      attempts: input.job.attempts + 1,
      error: null,
    })
    .where(
      and(
        eq(generationJob.id, input.job.id),
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
    generationSnapshot?: GenerationSnapshot;
    workerId: string;
    now?: Date;
    sourceRevisionId?: string | null;
  },
): ClaimResult {
  const now = input.now ?? new Date();
  const revisionId = sourceRevision(db, input.judgmentId, input.sourceRevisionId);

  const claimedId = insertClaim(db, { ...input, sourceRevisionId: revisionId, now });
  if (claimedId !== undefined) {
    return { kind: "claimed", jobId: claimedId };
  }

  const existing = findJob(db, {
    judgmentId: input.judgmentId,
    sourceRevisionId: revisionId,
    level: input.level,
    promptVersion: input.promptVersion,
  });
  // 유니크 제약 때문에 여기서 행이 없을 수는 없다. 있어도 다시 시도하는 편이 안전하다.
  if (!existing) {
    return claimGenerationJob(db, { ...input, sourceRevisionId: revisionId, now });
  }
  if (existing.status === "done") {
    return { kind: "done", jobId: existing.id };
  }
  if (
    reclaimJob(db, {
      job: existing,
      workerId: input.workerId,
      now,
      generationSnapshot: input.generationSnapshot,
    })
  ) {
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
  input: {
    judgmentId: string;
    level: Level;
    promptVersion: string;
    sourceRevisionId?: string | null;
  },
): JobProgress | undefined {
  const revisionId = sourceRevision(db, input.judgmentId, input.sourceRevisionId);
  const row = findJob(db, {
    judgmentId: input.judgmentId,
    sourceRevisionId: revisionId,
    level: input.level,
    promptVersion: input.promptVersion,
  });
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

interface GenerationFailure {
  readonly caseNo: string;
  readonly level: Level;
  readonly at: Date | null;
  /** 화면 앞의 사람이 본 말. */
  readonly shown: string | null;
  /** 관리자만 보는 진짜 원인. */
  readonly detail: string | null;
}

/**
 * 최근에 실패한 생성. **관리자 화면이 읽는다.**
 *
 * 이 통로가 없던 동안 운영자가 원인을 아는 방법은 터미널에서 스크립트를 돌리는 것뿐이었다.
 * 그래서 실패 이유를 이용자 화면에 적었고, 그것이 운영 설정을 공개하는 결과가 됐다.
 * 볼 사람이 볼 곳을 만들면 그럴 이유가 없다.
 */
function listRecentGenerationFailures(db: CorpusDb, limit: number): GenerationFailure[] {
  return db
    .select({
      caseNo: judgment.caseNoDisplay,
      level: generationJob.level,
      at: generationJob.finishedAt,
      shown: generationJob.error,
      detail: generationJob.detail,
    })
    .from(generationJob)
    .innerJoin(judgment, eq(judgment.id, generationJob.judgmentId))
    .where(eq(generationJob.status, "failed"))
    .orderBy(desc(generationJob.finishedAt))
    .limit(limit)
    .all();
}

/**
 * 작업을 닫는다.
 *
 * **실패는 두 얼굴로 적는다.** `reason`은 화면 앞의 이용자가 읽고, `detail`은 관리자만
 * 본다. 예전에는 하나였고 그 하나가 공개 화면에 그대로 나갔다 — AI API 주소와 제공자의
 * 오류 본문이 판결문 페이지에 찍혔고, 정작 그것으로 고칠 수 있는 관리자는 보지 못했다.
 */
function finishGenerationJob(
  db: CorpusDb,
  jobId: string,
  result: JobOutcome,
  now: Date = new Date(),
): void {
  db.update(generationJob)
    .set({
      status: result.ok ? "done" : "failed",
      // 끝난 작업에 단계가 남아 있으면 화면이 "아직 만드는 중"으로 읽는다.
      stage: null,
      error: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail,
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

/**
 * 음성 몫에서 한 번을 뗀다. **설명 생성과 같은 방식, 다른 통.**
 *
 * 세는 것과 판단하는 것을 한 문장으로 한다 — 읽고 나서 더하면 그 사이에 들어온 요청이
 * 마지막 한 번을 같이 가져간다.
 */
function reserveAudioSlot(db: CorpusDb, input: { day: string; limit: number }): boolean {
  if (input.limit <= 0) {
    return false;
  }

  return (
    db
      .insert(audioUsage)
      .values({ day: input.day, count: 1 })
      .onConflictDoUpdate({
        target: audioUsage.day,
        set: { count: sql`${audioUsage.count} + 1` },
        setWhere: lt(audioUsage.count, input.limit),
      })
      .returning({ count: audioUsage.count })
      .all().length > 0
  );
}

/** 그날 음성을 몇 벌 만들었나. */
function countAudioOn(db: CorpusDb, day: string): number {
  return db.select().from(audioUsage).where(eq(audioUsage.day, day)).get()?.count ?? 0;
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
  input: {
    judgmentId: string;
    sourceRevisionId: string | null;
    promptVersion: string;
    nodes: readonly StructureNodeInput[];
  },
): string[] {
  const ids = input.nodes.map(() => newId());

  tx.insert(structureNode)
    .values(
      input.nodes.map((node, index) => ({
        id: ids[index] as string,
        judgmentId: input.judgmentId,
        sourceRevisionId: input.sourceRevisionId,
        promptVersion: input.promptVersion,
        kind: node.kind,
        payload: node.payload,
        occurredOn: node.occurredOn ?? null,
        orderIdx: node.orderIdx,
      })),
    )
    .run();

  tx.insert(nodeSpan)
    .values(
      input.nodes.flatMap((node, index) =>
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
  return saveStructureAtRevision(db, {
    judgmentId,
    promptVersion,
    nodes,
    sourceRevisionId: findCurrentJudgmentRevisionId(db, judgmentId),
  });
}

function storedStructureIds(
  tx: CorpusTx,
  input: { judgmentId: string; revisionId: string | null; promptVersion: string },
): string[] {
  return tx
    .select({ id: structureNode.id })
    .from(structureNode)
    .where(
      and(
        eq(structureNode.judgmentId, input.judgmentId),
        eq(structureNode.promptVersion, input.promptVersion),
        input.revisionId === null
          ? isNull(structureNode.sourceRevisionId)
          : eq(structureNode.sourceRevisionId, input.revisionId),
      ),
    )
    .orderBy(structureNode.orderIdx)
    .all()
    .map((row) => row.id);
}

function allStructuresHaveEvidence(tx: CorpusTx, ids: readonly string[]): boolean {
  const linked = new Set(
    tx
      .select({ id: nodeSpan.structureNodeId })
      .from(nodeSpan)
      .where(inArray(nodeSpan.structureNodeId, [...ids]))
      .all()
      .map((row) => row.id),
  );
  return ids.every((id) => linked.has(id));
}

function saveStructureAtRevision(
  db: CorpusDb,
  input: {
    judgmentId: string;
    promptVersion: string;
    nodes: readonly StructureNodeInput[];
    sourceRevisionId: string | null;
  },
): string[] {
  const { judgmentId, nodes, sourceRevisionId: revisionId } = input;
  const storedVersion = versionForRevision(input.promptVersion, revisionId);
  assertNodesGrounded(nodes, new Set(listSpans(db, judgmentId, revisionId).map((row) => row.id)));

  return db.transaction(
    (tx) => {
      const existing = storedStructureIds(tx, {
        judgmentId,
        revisionId,
        promptVersion: storedVersion,
      });
      if (existing.length > 0) {
        if (allStructuresHaveEvidence(tx, existing)) {
          return existing;
        }
        // 근거 연결이 깨진 같은 판의 캐시만 버린다. 다른 원문판의 구조와 span은 건드리지 않는다.
        tx.delete(structureNode)
          .where(
            and(
              eq(structureNode.judgmentId, judgmentId),
              eq(structureNode.promptVersion, storedVersion),
            ),
          )
          .run();
      }
      if (nodes.length === 0) {
        return [];
      }

      return insertStructure(tx, {
        judgmentId,
        sourceRevisionId: revisionId,
        promptVersion: storedVersion,
        nodes,
      });
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
  pinnedRevisionId?: string | null,
): StructureNodeRow[] {
  const revisionId = sourceRevision(db, judgmentId, pinnedRevisionId);
  const nodes = db
    .select()
    .from(structureNode)
    .where(
      and(
        eq(structureNode.judgmentId, judgmentId),
        eq(structureNode.promptVersion, versionForRevision(promptVersion, revisionId)),
        revisionId === null
          ? isNull(structureNode.sourceRevisionId)
          : eq(structureNode.sourceRevisionId, revisionId),
      ),
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

  // 근거가 하나라도 끊긴 추출본은 일부만 모델에 넘기지 않고 전체 캐시를 무효화한다.
  if (nodes.some((node) => !byNode.has(node.id))) {
    return [];
  }

  return nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    payload: node.payload,
    occurredOn: node.occurredOn,
    orderIdx: node.orderIdx,
    spanIds: byNode.get(node.id) as string[],
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
  claimStructureGenerationJob,
  countGenerationsOn,
  findApprovedRendition,
  findContentReleaseBundle,
  findPublishedAudio,
  findPublishedRendition,
  findPublishedSentenceContext,
  findCurrentJudgmentRevisionId,
  findJudgmentByCaseNo,
  findJudgmentById,
  findJudgmentRevision,
  findLatestLawVersion,
  findLatestRendition,
  findRenditionById,
  findRenditionAtRevision,
  findLawArticle,
  findLawVersionAt,
  findGenerationProgress,
  findLawVersionByMst,
  findRendition,
  finishGenerationJob,
  finishStructureGenerationJob,
  heartbeatGenerationJob,
  heartbeatStructureGenerationJob,
  listLawArticles,
  listJudgmentRevisions,
  listJudgmentRevisionSummaries,
  listJudgmentIdentities,
  listContentReleases,
  listLawNameEntries,
  listLawSections,
  listSentences,
  listSpans,
  countAudioOn,
  listRecentGenerationFailures,
  listRenditionReleaseOverview,
  listReportedSentenceDetails,
  createEditedRendition,
  reserveAudioSlot,
  listStructureNodes,
  recordLookupMiss,
  reserveGenerationSlot,
  publishRendition,
  restoreContentRelease,
  reviewRendition,
  saveJudgmentText,
  saveLawArticles,
  saveRendition,
  saveStructure,
  saveStructureAtRevision,
  searchLawVersions,
  setGenerationStage,
  upsertJudgment,
  upsertLawVersions,
  withdrawPublishedRendition,
};
export type {
  GenerationFailure,
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
  ReviewState,
  ReleaseMutationResult,
  ReviewMutationResult,
  ReleaseState,
  RenditionReleaseOverview,
  RenditionEditResult,
  SentenceInput,
  SpanInput,
  StructureKind,
  StructureNodeInput,
  StructureNodeRow,
};
