/**
 * 올린 문서의 설명본 저장소. `PRODUCT.md` §6.3
 *
 * `corpus/repository.ts`의 생성 관련 함수들과 **의도적으로 같은 모양**이다. 표가 갈라져
 * 있으니(§6.1) 쿼리도 갈라진다 — 두 DB를 조인하지 않는다는 규칙이 여기서는 "같은 코드로
 * 두 표를 다루지 못한다"는 뜻이 된다. 대신 **모양을 같게 두어** 그 위층
 * (`server/pipeline-store.ts`)이 인터페이스 하나로 양쪽을 쓴다.
 *
 * `repository.ts`와 파일을 나눈 이유는 관심사다. 저쪽은 문서의 소유·보관·삭제를 다루고,
 * 이쪽은 그 문서에서 나온 **생성물**을 다룬다.
 *
 * **소유자 확인은 이 계층이 하지 않는다.** 부르는 쪽이 이미 `findUpload(db, id, userId)`로
 * 문서를 확인한 뒤 그 `uploadId`를 넘긴다 — 확인을 두 번 하면 한 번은 언젠가 빠진다.
 */

import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { JobOutcome } from "@/lib/job-outcome";
import { STALE_AFTER_MS } from "@/lib/timing";
import type { AppDb } from "../client";
import {
  uploadGenerationJob,
  uploadNodeSpan,
  uploadRendition,
  uploadRenditionSentence,
  uploadSpan,
  uploadStructureNode,
} from "./schema";

type Level = (typeof uploadRendition.level.enumValues)[number];
type StructureKind = (typeof uploadStructureNode.kind.enumValues)[number];
type Confidence = (typeof uploadRenditionSentence.confidence.enumValues)[number];
type JobStage = (typeof uploadGenerationJob.stage.enumValues)[number];
type JobStatus = (typeof uploadGenerationJob.status.enumValues)[number];

const newId = (): string => crypto.randomUUID();

/* 좀비 판정 기준은 `lib/timing.ts` 하나뿐이다. `corpus` 쪽과 같은 값을 쓴다. */

interface StructureNodeInput {
  kind: StructureKind;
  payload: unknown;
  occurredOn?: Date | null;
  orderIdx: number;
  /** 이 노드의 근거가 되는 원문 span. 비어 있으면 받지 않는다. */
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

/**
 * 구조화 추출 결과를 저장한다.
 *
 * **근거 없는 노드를 받지 않고, 남의 문서 span도 받지 않는다.** 외래 키는 span이
 * 존재한다는 것만 보장하고 어느 문서의 span인지는 보지 않는다 — 공개 판례 쪽과 같은
 * 이유이고, 여기서는 **다른 사람의 문서**를 가리킬 수 있어 더 나쁘다.
 *
 * **이미 구조가 있으면 그것을 남긴다.** 공개 판례 쪽(`saveStructure`)과 같은 이유다 —
 * 레벨 둘을 함께 돌리면 둘 다 구조가 없는 것을 보고 각자 추출하는데, 나중에 저장한 쪽이
 * 앞선 쪽의 노드를 지우면 그 id로 문장을 넣던 작업이 `FOREIGN KEY constraint failed`로
 * 끝난다. 확인과 저장을 한 트랜잭션에 묶고 `immediate`로 연다.
 */
/** 트랜잭션 안의 db 손잡이. 드리즐이 넘겨 주는 것과 같은 타입이다. */
type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

/** 노드와 근거 연결을 넣는다. 부르는 쪽이 이미 "넣어도 되는가"를 판단했다. */
function insertStructure(
  tx: AppTx,
  uploadId: string,
  promptVersion: string,
  nodes: readonly StructureNodeInput[],
): string[] {
  const ids = nodes.map(() => newId());

  tx.insert(uploadStructureNode)
    .values(
      nodes.map((node, index) => ({
        id: ids[index] as string,
        uploadId,
        promptVersion,
        kind: node.kind,
        payload: node.payload,
        occurredOn: node.occurredOn ?? null,
        orderIdx: node.orderIdx,
      })),
    )
    .run();

  tx.insert(uploadNodeSpan)
    .values(
      nodes.flatMap((node, index) =>
        // 같은 span을 두 번 적어 오는 모델이 있다. 복합 기본키가 터지기 전에 줄인다.
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
        throw new Error(`이 문서의 span이 아닙니다 (node kind=${node.kind}, span=${spanId}).`);
      }
    }
  }
}

function saveUploadStructure(
  db: AppDb,
  uploadId: string,
  promptVersion: string,
  nodes: readonly StructureNodeInput[],
): string[] {
  assertNodesGrounded(
    nodes,
    new Set(
      db
        .select({ id: uploadSpan.id })
        .from(uploadSpan)
        .where(eq(uploadSpan.uploadId, uploadId))
        .all()
        .map((row) => row.id),
    ),
  );

  return db.transaction(
    (tx) => {
      const existing = tx
        .select({ id: uploadStructureNode.id })
        .from(uploadStructureNode)
        .where(
          and(
            eq(uploadStructureNode.uploadId, uploadId),
            eq(uploadStructureNode.promptVersion, promptVersion),
          ),
        )
        .orderBy(uploadStructureNode.orderIdx)
        .all()
        .map((row) => row.id);
      if (existing.length > 0) {
        return existing;
      }
      if (nodes.length === 0) {
        return [];
      }

      return insertStructure(tx, uploadId, promptVersion, nodes);
    },
    { behavior: "immediate" },
  );
}

/** 구조 노드를 근거 span과 함께 읽는다. 노드마다 따로 조회하지 않는다(§10.2 N+1 금지). */
function listUploadStructureNodes(
  db: AppDb,
  uploadId: string,
  promptVersion: string,
): StructureNodeRow[] {
  const nodes = db
    .select()
    .from(uploadStructureNode)
    .where(
      and(
        eq(uploadStructureNode.uploadId, uploadId),
        eq(uploadStructureNode.promptVersion, promptVersion),
      ),
    )
    .orderBy(uploadStructureNode.orderIdx)
    .all();

  if (nodes.length === 0) {
    return [];
  }

  const links = db
    .select()
    .from(uploadNodeSpan)
    .where(
      inArray(
        uploadNodeSpan.structureNodeId,
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

function saveUploadRendition(
  db: AppDb,
  input: {
    uploadId: string;
    level: Level;
    model: string;
    promptVersion: string;
    sentences: readonly SentenceInput[];
  },
): string {
  return db.transaction((tx) => {
    const id = newId();
    tx.insert(uploadRendition)
      .values({
        id,
        uploadId: input.uploadId,
        level: input.level,
        model: input.model,
        promptVersion: input.promptVersion,
      })
      .run();

    if (input.sentences.length > 0) {
      tx.insert(uploadRenditionSentence)
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

function findUploadRendition(db: AppDb, uploadId: string, level: Level, promptVersion: string) {
  return db
    .select()
    .from(uploadRendition)
    .where(
      and(
        eq(uploadRendition.uploadId, uploadId),
        eq(uploadRendition.level, level),
        eq(uploadRendition.promptVersion, promptVersion),
      ),
    )
    .get();
}

/** 프롬프트 버전을 가리지 않고 이 문서·레벨에서 가장 최근에 만든 설명을 읽는다. */
function findLatestUploadRendition(db: AppDb, uploadId: string, level: Level) {
  return db
    .select()
    .from(uploadRendition)
    .where(and(eq(uploadRendition.uploadId, uploadId), eq(uploadRendition.level, level)))
    .orderBy(desc(uploadRendition.generatedAt))
    .get();
}

function listUploadSentences(db: AppDb, renditionId: string) {
  const sentences = db
    .select()
    .from(uploadRenditionSentence)
    .where(eq(uploadRenditionSentence.renditionId, renditionId))
    .orderBy(uploadRenditionSentence.orderIdx)
    .all();

  /*
   * 공개 판례와 같은 방식으로 설명 문장의 근거를 한 번에 붙인다. 문장마다
   * `upload_node_span`을 다시 읽으면 긴 판결문에서 N+1이 되므로, 구조 노드 id를 모아
   * 한 쿼리로 읽고 메모리에서 문장에 배분한다.
   */
  const nodeIds = sentences
    .map((sentence) => sentence.structureNodeId)
    .filter((id): id is string => id !== null);
  if (nodeIds.length === 0) {
    return sentences.map((sentence) => ({ ...sentence, sourceSpanIds: [] as string[] }));
  }

  const spansByNode = new Map<string, string[]>();
  for (const row of db
    .select({ structureNodeId: uploadNodeSpan.structureNodeId, spanId: uploadNodeSpan.spanId })
    .from(uploadNodeSpan)
    .where(inArray(uploadNodeSpan.structureNodeId, nodeIds))
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

type ClaimResult =
  | { readonly kind: "claimed"; readonly jobId: string }
  | { readonly kind: "running"; readonly jobId: string }
  | { readonly kind: "done"; readonly jobId: string };

function insertClaim(
  db: AppDb,
  input: { uploadId: string; level: Level; promptVersion: string; workerId: string; now: Date },
): string | undefined {
  const rows = db
    .insert(uploadGenerationJob)
    .values({
      id: newId(),
      uploadId: input.uploadId,
      level: input.level,
      promptVersion: input.promptVersion,
      status: "running",
      claimedBy: input.workerId,
      heartbeatAt: input.now,
      attempts: 1,
    })
    .onConflictDoNothing()
    .returning({ id: uploadGenerationJob.id })
    .all();
  return rows[0]?.id;
}

function findJob(db: AppDb, uploadId: string, level: Level, promptVersion: string) {
  return db
    .select()
    .from(uploadGenerationJob)
    .where(
      and(
        eq(uploadGenerationJob.uploadId, uploadId),
        eq(uploadGenerationJob.level, level),
        eq(uploadGenerationJob.promptVersion, promptVersion),
      ),
    )
    .get();
}

/** 실패했거나 heartbeat가 멈춘 작업만 회수한다. 조건을 UPDATE에 담아 경합을 DB가 판정하게 한다. */
function reclaimJob(
  db: AppDb,
  job: { id: string; attempts: number },
  workerId: string,
  now: Date,
): boolean {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const rows = db
    .update(uploadGenerationJob)
    .set({
      status: "running",
      claimedBy: workerId,
      heartbeatAt: now,
      attempts: job.attempts + 1,
      error: null,
    })
    .where(
      and(
        eq(uploadGenerationJob.id, job.id),
        or(
          eq(uploadGenerationJob.status, "failed"),
          lt(uploadGenerationJob.heartbeatAt, staleBefore),
        ),
      ),
    )
    .returning({ id: uploadGenerationJob.id })
    .all();
  return rows.length > 0;
}

/**
 * 생성 작업을 선점한다. `corpus`의 `claimGenerationJob`과 같은 규칙이다(§5.3).
 *
 * 문서 주인 혼자 여는 문서라 동시 요청이 겹칠 일은 드물지만, **탭을 두 개 열어 두 번
 * 누르는 것**은 흔하다. 그때 모델을 두 번 부르지 않는다.
 */
function claimUploadJob(
  db: AppDb,
  input: {
    uploadId: string;
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

  const existing = findJob(db, input.uploadId, input.level, input.promptVersion);
  if (!existing) {
    return claimUploadJob(db, { ...input, now });
  }
  if (existing.status === "done") {
    return { kind: "done", jobId: existing.id };
  }
  if (reclaimJob(db, existing, input.workerId, now)) {
    return { kind: "claimed", jobId: existing.id };
  }
  return { kind: "running", jobId: existing.id };
}

/** 단계를 적는다. 그것이 곧 heartbeat다 — 두 번 쓰지 않는다. */
function setUploadJobStage(
  db: AppDb,
  jobId: string,
  stage: JobStage,
  now: Date = new Date(),
): void {
  db.update(uploadGenerationJob)
    .set({ stage, heartbeatAt: now })
    .where(eq(uploadGenerationJob.id, jobId))
    .run();
}

interface UploadGenerationFailure {
  readonly level: Level;
  readonly at: Date | null;
  readonly shown: string | null;
  readonly detail: string | null;
}

/**
 * 최근에 실패한 업로드 생성. **어느 문서인지는 내지 않는다.**
 *
 * 올린 판결문은 그 사람의 것이고, 관리자라도 어떤 문서를 올렸는지 목록으로 볼 이유가
 * 없다(§7). 여기 필요한 것은 "무엇이 우리 쪽에서 깨졌나"이지 누구의 문서인가가 아니다 —
 * 진단 문구는 우리가 쓴 말이라 문서 내용을 담지 않는다.
 */
function listRecentUploadFailures(db: AppDb, limit: number): UploadGenerationFailure[] {
  return db
    .select({
      level: uploadGenerationJob.level,
      at: uploadGenerationJob.finishedAt,
      shown: uploadGenerationJob.error,
      detail: uploadGenerationJob.detail,
    })
    .from(uploadGenerationJob)
    .where(eq(uploadGenerationJob.status, "failed"))
    .orderBy(desc(uploadGenerationJob.finishedAt))
    .limit(limit)
    .all();
}

/**
 * 작업을 닫는다.
 *
 * **실패는 두 얼굴로 적는다.** `reason`은 화면 앞의 이용자가 읽고, `detail`은 관리자만
 * 본다. 예전에는 하나였고 그 하나가 공개 화면에 그대로 나갔다 — AI API 주소와 제공자의
 * 오류 본문이 문서 페이지에 찍혔고, 정작 그것으로 고칠 수 있는 관리자는 보지 못했다.
 */
function finishUploadJob(
  db: AppDb,
  jobId: string,
  result: JobOutcome,
  now: Date = new Date(),
): void {
  db.update(uploadGenerationJob)
    .set({
      status: result.ok ? "done" : "failed",
      // 끝난 작업에 단계가 남아 있으면 화면이 "아직 만드는 중"으로 읽는다.
      stage: null,
      error: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail,
      finishedAt: now,
      heartbeatAt: now,
    })
    .where(eq(uploadGenerationJob.id, jobId))
    .run();
}

interface JobProgress {
  readonly status: JobStatus;
  readonly stage: JobStage | null;
  readonly error: string | null;
  readonly heartbeatAt: Date | null;
}

function findUploadJobProgress(
  db: AppDb,
  input: { uploadId: string; level: Level; promptVersion: string },
): JobProgress | undefined {
  const row = findJob(db, input.uploadId, input.level, input.promptVersion);
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

export {
  claimUploadJob,
  findLatestUploadRendition,
  findUploadJobProgress,
  findUploadRendition,
  finishUploadJob,
  listUploadSentences,
  listRecentUploadFailures,
  listUploadStructureNodes,
  saveUploadRendition,
  saveUploadStructure,
  setUploadJobStage,
};
export type {
  UploadGenerationFailure,
  ClaimResult,
  Confidence,
  JobProgress,
  JobStage,
  JobStatus,
  Level,
  SentenceInput,
  StructureKind,
  StructureNodeInput,
  StructureNodeRow,
};
