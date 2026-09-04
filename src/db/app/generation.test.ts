import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../client";
import { createTestAppDb } from "../testing";
import {
  claimUploadJob,
  findUploadJobProgress,
  findUploadRendition,
  finishUploadJob,
  listUploadSentences,
  listUploadStructureNodes,
  STALE_AFTER_MS,
  saveUploadRendition,
  saveUploadStructure,
  setUploadJobStage,
} from "./generation";
import { createUser, listUploadSpans, saveUpload } from "./repository";

let db: AppDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestAppDb());
});

afterEach(() => {
  close();
});

let seq = 0;

/** 문서 하나와 그 원문 두 문장. 생성물이 매달릴 자리다. */
function seedUpload(): { uploadId: string; spanIds: string[] } {
  seq += 1;
  const userId = createUser(db, { email: `user${seq}@example.com`, passwordHash: "hash" });
  if (userId === undefined) {
    throw new Error("테스트 사용자를 만들지 못했습니다.");
  }
  const saved = saveUpload(db, {
    userId,
    title: "판결문",
    filename: null,
    docHash: `hash-${seq}`,
    charCount: 20,
    caseNoCanonical: null,
    retentionUntil: null,
    spans: [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 10, text: "첫 문장이다." },
      { paraIdx: 0, sentIdx: 1, charStart: 10, charEnd: 20, text: "둘째 문장이다." },
    ],
    maskCounts: {},
  });

  return {
    uploadId: saved.id,
    spanIds: listUploadSpans(db, saved.id).map((span) => span.id),
  };
}

describe("saveUploadStructure", () => {
  it("노드와 근거 연결을 함께 저장한다", () => {
    const { uploadId, spanIds } = seedUpload();
    saveUploadStructure(db, uploadId, [
      { kind: "holding", payload: { text: "판단" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
    ]);

    const nodes = listUploadStructureNodes(db, uploadId);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.spanIds).toEqual([spanIds[0]]);
  });

  it("근거 span이 없는 노드는 받지 않는다", () => {
    const { uploadId } = seedUpload();
    expect(() =>
      saveUploadStructure(db, uploadId, [
        { kind: "issue", payload: { text: "쟁점" }, orderIdx: 0, spanIds: [] },
      ]),
    ).toThrow(/근거 span이 없는/u);
  });

  it("남의 문서 span을 근거로 대면 거절한다 — 외래 키만으로는 못 막는다", () => {
    const mine = seedUpload();
    const other = seedUpload();

    expect(() =>
      saveUploadStructure(db, mine.uploadId, [
        {
          kind: "holding",
          payload: { text: "판단" },
          orderIdx: 0,
          spanIds: [other.spanIds[0] as string],
        },
      ]),
    ).toThrow(/이 문서의 span이 아닙니다/u);
  });

  it("다시 추출하면 옛 구조를 남기지 않는다", () => {
    const { uploadId, spanIds } = seedUpload();
    const first: Parameters<typeof saveUploadStructure>[2] = [
      { kind: "issue", payload: { text: "옛 쟁점" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
    ];
    saveUploadStructure(db, uploadId, first);
    saveUploadStructure(db, uploadId, [
      {
        kind: "holding",
        payload: { text: "새 판단" },
        orderIdx: 0,
        spanIds: [spanIds[1] as string],
      },
    ]);

    const nodes = listUploadStructureNodes(db, uploadId);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.kind).toBe("holding");
  });

  it("같은 span을 두 번 적어 와도 한 번만 잇는다", () => {
    const { uploadId, spanIds } = seedUpload();
    saveUploadStructure(db, uploadId, [
      {
        kind: "holding",
        payload: { text: "판단" },
        orderIdx: 0,
        spanIds: [spanIds[0] as string, spanIds[0] as string],
      },
    ]);

    expect(listUploadStructureNodes(db, uploadId)[0]?.spanIds).toEqual([spanIds[0]]);
  });
});

describe("saveUploadRendition", () => {
  it("변환본과 문장을 저장하고 순서대로 읽는다", () => {
    const { uploadId, spanIds } = seedUpload();
    const [nodeId] = saveUploadStructure(db, uploadId, [
      { kind: "holding", payload: { text: "판단" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
    ]);

    const renditionId = saveUploadRendition(db, {
      uploadId,
      level: "L2",
      model: "mock",
      promptVersion: "v1",
      sentences: [
        { orderIdx: 0, role: "heading", text: "무슨 일이 있었나요", confidence: "grounded" },
        {
          orderIdx: 1,
          role: "body",
          text: "법원이 이렇게 봤어요.",
          structureNodeId: nodeId ?? null,
          confidence: "needs_check",
          checkReason: "원문과 대조가 필요해요.",
        },
      ],
    });

    const sentences = listUploadSentences(db, renditionId);
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      "무슨 일이 있었나요",
      "법원이 이렇게 봤어요.",
    ]);
    expect(sentences[0]?.sourceSpanIds).toEqual([]);
    expect(sentences[1]?.structureNodeId).toBe(nodeId);
    expect(sentences[1]?.sourceSpanIds).toEqual([spanIds[0]]);
    expect(findUploadRendition(db, uploadId, "L2", "v1")?.id).toBe(renditionId);
  });

  it("프롬프트 버전이 다르면 다른 변환본이다", () => {
    const { uploadId } = seedUpload();
    saveUploadRendition(db, {
      uploadId,
      level: "L2",
      model: "mock",
      promptVersion: "v1",
      sentences: [{ orderIdx: 0, text: "문장", confidence: "grounded" }],
    });

    expect(findUploadRendition(db, uploadId, "L2", "v2")).toBeUndefined();
  });

  it("문서를 지우면 설명본도 함께 지워진다", () => {
    const { uploadId } = seedUpload();
    saveUploadRendition(db, {
      uploadId,
      level: "L2",
      model: "mock",
      promptVersion: "v1",
      sentences: [{ orderIdx: 0, text: "문장", confidence: "grounded" }],
    });

    db.run("delete from upload");
    expect(findUploadRendition(db, uploadId, "L2", "v1")).toBeUndefined();
  });
});

describe("claimUploadJob", () => {
  const base = { level: "L2" as const, promptVersion: "v1" };

  it("첫 요청만 선점하고 나머지는 기존 작업에 붙는다 — 탭 두 개로 두 번 눌러도 한 번만 만든다", () => {
    const { uploadId } = seedUpload();
    const first = claimUploadJob(db, { ...base, uploadId, workerId: "w1" });
    const second = claimUploadJob(db, { ...base, uploadId, workerId: "w2" });

    expect(first.kind).toBe("claimed");
    expect(second.kind).toBe("running");
    expect(second.jobId).toBe(first.jobId);
  });

  it("끝난 작업은 done으로 알린다", () => {
    const { uploadId } = seedUpload();
    const claim = claimUploadJob(db, { ...base, uploadId, workerId: "w1" });
    finishUploadJob(db, claim.jobId, { ok: true });

    expect(claimUploadJob(db, { ...base, uploadId, workerId: "w2" }).kind).toBe("done");
  });

  it("heartbeat가 멈춘 좀비 작업을 회수한다", () => {
    const { uploadId } = seedUpload();
    const start = new Date("2026-09-04T00:00:00Z");
    claimUploadJob(db, { ...base, uploadId, workerId: "w1", now: start });

    const stillFresh = new Date(start.getTime() + STALE_AFTER_MS - 1_000);
    expect(claimUploadJob(db, { ...base, uploadId, workerId: "w2", now: stillFresh }).kind).toBe(
      "running",
    );

    const stale = new Date(start.getTime() + STALE_AFTER_MS + 1_000);
    expect(claimUploadJob(db, { ...base, uploadId, workerId: "w3", now: stale }).kind).toBe(
      "claimed",
    );
  });

  it("단계를 적으면 그대로 읽히고, 끝나면 지워진다", () => {
    const { uploadId } = seedUpload();
    const claim = claimUploadJob(db, { ...base, uploadId, workerId: "w1" });

    setUploadJobStage(db, claim.jobId, "verify");
    expect(findUploadJobProgress(db, { ...base, uploadId })).toMatchObject({
      status: "running",
      stage: "verify",
    });

    finishUploadJob(db, claim.jobId, { ok: false, error: "모델이 답하지 않았습니다" });
    expect(findUploadJobProgress(db, { ...base, uploadId })).toMatchObject({
      status: "failed",
      stage: null,
      error: "모델이 답하지 않았습니다",
    });
  });

  it("작업이 없으면 진행도 없다", () => {
    const { uploadId } = seedUpload();
    expect(findUploadJobProgress(db, { ...base, uploadId })).toBeUndefined();
  });
});
