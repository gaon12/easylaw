import type { JobOutcome } from "@/lib/job-outcome";
import "server-only";
import {
  claimUploadJob,
  findUploadJobProgress,
  findUploadRendition,
  finishUploadJob,
  listUploadStructureNodes,
  saveUploadRendition,
  saveUploadStructure,
  setUploadJobStage,
} from "@/db/app/generation";
import { listUploadSpans } from "@/db/app/repository";
import { appDb, corpusDb } from "@/db/client";
import {
  claimGenerationJob,
  findGenerationProgress,
  findRendition,
  finishGenerationJob,
  listSpans,
  listStructureNodes,
  saveRendition,
  saveStructure,
  setGenerationStage,
} from "@/db/corpus/repository";

/**
 * 파이프라인이 보는 저장소. `PRODUCT.md` §6.3
 *
 * > `corpus`와 `app`의 span·rendition은 **모양이 같고 저장 위치만 다르다.**
 * > 변환 파이프라인과 렌더링 코드는 저장소 인터페이스 하나를 두고 양쪽에 그대로 쓴다.
 *
 * 그 인터페이스가 여기다. 위쪽(파이프라인)은 자기가 공개 판례를 다루는지 남이 올린
 * 판결문을 다루는지 **모른다.** 알 필요가 없고, 알면 언젠가 한쪽에만 있는 규칙이 생긴다.
 *
 * **두 DB를 잇는 것이 아니다.** 어느 store를 만드느냐로 어느 DB를 쓸지가 이미 정해지고,
 * 한 번의 생성은 한쪽 DB만 만진다. `corpus`와 `app`을 조인하지 않는다는 규칙(§6.1)은
 * 그대로다.
 */

/** 프롬프트에 이름을 붙일 때 필요한 만큼만. `lib/pipeline/span-label.ts`가 받는 모양이다. */
interface StoreSpan {
  readonly id: string;
  readonly paraIdx: number;
  readonly sentIdx: number;
  readonly text: string;
}

interface StoreNode {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly spanIds: readonly string[];
}

interface StoreNodeInput {
  readonly kind: string;
  readonly payload: unknown;
  readonly occurredOn?: Date | undefined;
  readonly orderIdx: number;
  readonly spanIds: readonly string[];
}

interface StoreSentence {
  readonly orderIdx: number;
  readonly role: "heading" | "body";
  readonly text: string;
  readonly structureNodeId: string | null;
  readonly confidence: "grounded" | "needs_check" | "ungrounded";
  readonly checkReason?: string | null;
}

type StoreLevel = "L1" | "L2" | "L3" | "L4";
type StoreStage = "structure" | "render" | "verify" | "save";

type StoreClaim =
  | { readonly kind: "claimed"; readonly jobId: string }
  | { readonly kind: "running"; readonly jobId: string }
  | { readonly kind: "done"; readonly jobId: string };

interface StoreProgress {
  readonly status: "queued" | "running" | "done" | "failed";
  readonly stage: StoreStage | null;
  readonly error: string | null;
}

/**
 * 한 문서에 매인 저장소.
 *
 * 문서 id를 메서드마다 넘기지 않고 **만들 때 한 번** 받는다. 그래야 파이프라인 도중에
 * 다른 문서의 id가 섞여 들어갈 자리가 없다 — 근거가 남의 판결문을 가리키는 사고는
 * 이 계층에서 구조적으로 막는 편이 낫다.
 */
interface PipelineStore {
  /** 어느 쪽 문서인가. 화면 주소를 만들 때만 쓴다. 파이프라인은 보지 않는다. */
  readonly kind: "case" | "doc";
  readonly documentId: string;

  listSpans(): readonly StoreSpan[];
  /**
   * 이 추출 프롬프트 판이 뽑은 구조만 읽는다.
   *
   * 판을 받는 이유는 **지시문을 고치면 옛 구조가 그대로 쓰이는 것을 막기** 위해서다.
   * 옛 노드는 지우지 않고 남겨 둔다 — 그 id로 만들어진 옛 설명의 근거 링크가 살아 있어야
   * 한다(§6.4). 판이 다르면 나란히 두고, 읽는 쪽이 자기 판만 고른다.
   */
  listNodes(extractVersion: string): readonly StoreNode[];
  saveNodes(extractVersion: string, nodes: readonly StoreNodeInput[]): void;

  claimJob(input: { level: StoreLevel; promptVersion: string; workerId: string }): StoreClaim;
  setStage(jobId: string, stage: StoreStage): void;
  finishJob(jobId: string, result: JobOutcome): void;
  findProgress(level: StoreLevel, promptVersion: string): StoreProgress | undefined;

  saveRendition(input: {
    level: StoreLevel;
    model: string;
    promptVersion: string;
    sentences: readonly StoreSentence[];
  }): string;
  findRenditionId(level: StoreLevel, promptVersion: string): string | undefined;
}

/** 공개 판례. `corpus` DB. */
function caseStore(judgmentId: string): PipelineStore {
  const db = corpusDb();

  return {
    kind: "case",
    documentId: judgmentId,

    listSpans: () => listSpans(db, judgmentId),
    listNodes: (extractVersion) => listStructureNodes(db, judgmentId, extractVersion),
    saveNodes: (extractVersion, nodes) => {
      saveStructure(
        db,
        judgmentId,
        extractVersion,
        nodes.map((node) => ({
          kind: node.kind as Parameters<typeof saveStructure>[3][number]["kind"],
          payload: node.payload,
          occurredOn: node.occurredOn ?? null,
          orderIdx: node.orderIdx,
          spanIds: node.spanIds,
        })),
      );
    },

    claimJob: (input) => claimGenerationJob(db, { judgmentId, ...input }),
    setStage: (jobId, stage) => {
      setGenerationStage(db, jobId, stage);
    },
    finishJob: (jobId, result) => {
      finishGenerationJob(db, jobId, result);
    },
    findProgress: (level, promptVersion) =>
      findGenerationProgress(db, { judgmentId, level, promptVersion }),

    saveRendition: (input) => saveRendition(db, { judgmentId, ...input }),
    findRenditionId: (level, promptVersion) =>
      findRendition(db, judgmentId, level, promptVersion)?.id,
  };
}

/** 올린 판결문. `app` DB. 같은 인터페이스, 다른 파일. */
function docStore(uploadId: string): PipelineStore {
  const db = appDb();

  return {
    kind: "doc",
    documentId: uploadId,

    listSpans: () => listUploadSpans(db, uploadId),
    listNodes: (extractVersion) => listUploadStructureNodes(db, uploadId, extractVersion),
    saveNodes: (extractVersion, nodes) => {
      saveUploadStructure(
        db,
        uploadId,
        extractVersion,
        nodes.map((node) => ({
          kind: node.kind as Parameters<typeof saveUploadStructure>[3][number]["kind"],
          payload: node.payload,
          occurredOn: node.occurredOn ?? null,
          orderIdx: node.orderIdx,
          spanIds: node.spanIds,
        })),
      );
    },

    claimJob: (input) => claimUploadJob(db, { uploadId, ...input }),
    setStage: (jobId, stage) => {
      setUploadJobStage(db, jobId, stage);
    },
    finishJob: (jobId, result) => {
      finishUploadJob(db, jobId, result);
    },
    findProgress: (level, promptVersion) =>
      findUploadJobProgress(db, { uploadId, level, promptVersion }),

    saveRendition: (input) => saveUploadRendition(db, { uploadId, ...input }),
    findRenditionId: (level, promptVersion) =>
      findUploadRendition(db, uploadId, level, promptVersion)?.id,
  };
}

export { caseStore, docStore };
export type {
  PipelineStore,
  StoreClaim,
  StoreLevel,
  StoreNode,
  StoreNodeInput,
  StoreProgress,
  StoreSentence,
  StoreSpan,
  StoreStage,
};
