import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CorpusDb } from "../client";
import { createTestCorpusDb } from "../testing";
import {
  claimGenerationJob,
  findJudgmentByCaseNo,
  findRendition,
  finishGenerationJob,
  heartbeatGenerationJob,
  listSentences,
  listSpans,
  recordLookupMiss,
  STALE_AFTER_MS,
  saveJudgmentText,
  saveRendition,
  upsertJudgment,
} from "./repository";
import { lookupMiss } from "./schema";

let db: CorpusDb;
let close: () => void;

beforeEach(() => {
  const created = createTestCorpusDb();
  db = created.db;
  close = created.close;
});

afterEach(() => {
  close();
});

function seedJudgment(caseNo = "2019도12345"): string {
  return upsertJudgment(db, {
    caseNoCanonical: caseNo,
    caseNoDisplay: caseNo,
    court: "대법원",
    source: "law_go_kr",
  });
}

describe("upsertJudgment", () => {
  it("같은 사건번호로 두 번 넣어도 하나만 남는다", () => {
    const first = seedJudgment();
    const second = seedJudgment();
    expect(second).toBe(first);
  });

  it("정규화된 사건번호로 찾을 수 있다", () => {
    const id = seedJudgment("2026구합12345");
    expect(findJudgmentByCaseNo(db, "2026구합12345")?.id).toBe(id);
    expect(findJudgmentByCaseNo(db, "2026구합99999")).toBeUndefined();
  });
});

describe("saveJudgmentText", () => {
  it("문장을 순서대로 저장하고 본문 캐시 시각을 남긴다", () => {
    const id = seedJudgment();
    saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 10, text: "첫 문장이다." },
      { paraIdx: 0, sentIdx: 1, charStart: 10, charEnd: 20, text: "둘째 문장이다." },
    ]);

    const spans = listSpans(db, id);
    expect(spans.map((span) => span.text)).toEqual(["첫 문장이다.", "둘째 문장이다."]);
    expect(findJudgmentByCaseNo(db, "2019도12345")?.textCachedAt).toBeInstanceOf(Date);
  });

  it("다시 저장하면 이전 문장을 남기지 않는다", () => {
    const id = seedJudgment();
    saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "옛 문장" },
    ]);
    saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "새 문장" },
    ]);

    const spans = listSpans(db, id);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.text).toBe("새 문장");
  });
});

describe("saveRendition", () => {
  it("문장을 순서대로 저장하고 신뢰도를 보존한다", () => {
    const judgmentId = seedJudgment();
    const renditionId = saveRendition(db, {
      judgmentId,
      level: "L4",
      model: "test-model",
      promptVersion: "v1",
      sentences: [
        { orderIdx: 0, role: "heading", text: "결과", confidence: "grounded" },
        {
          orderIdx: 1,
          text: "구청의 결정을 취소해요.",
          confidence: "needs_check",
          checkReason: "법적 효과 표현이 추상적이에요.",
        },
      ],
    });

    const sentences = listSentences(db, renditionId);
    expect(sentences.map((s) => s.text)).toEqual(["결과", "구청의 결정을 취소해요."]);
    expect(sentences[0]?.role).toBe("heading");
    expect(sentences[1]?.confidence).toBe("needs_check");
    expect(sentences[1]?.checkReason).toBe("법적 효과 표현이 추상적이에요.");
  });

  it("같은 레벨·프롬프트 버전은 하나만 존재한다", () => {
    const judgmentId = seedJudgment();
    const args = {
      judgmentId,
      level: "L2" as const,
      model: "test-model",
      promptVersion: "v1",
      sentences: [],
    };
    saveRendition(db, args);
    expect(() => saveRendition(db, args)).toThrow();
    expect(findRendition(db, judgmentId, "L2", "v1")).toBeDefined();
  });

  it("프롬프트 버전이 다르면 이전 변환본을 지우지 않고 함께 둔다", () => {
    const judgmentId = seedJudgment();
    saveRendition(db, {
      judgmentId,
      level: "L2",
      model: "m",
      promptVersion: "v1",
      sentences: [],
    });
    saveRendition(db, {
      judgmentId,
      level: "L2",
      model: "m",
      promptVersion: "v2",
      sentences: [],
    });

    expect(findRendition(db, judgmentId, "L2", "v1")).toBeDefined();
    expect(findRendition(db, judgmentId, "L2", "v2")).toBeDefined();
  });
});

describe("claimGenerationJob", () => {
  const base = { level: "L2" as const, promptVersion: "v1" };

  it("첫 요청만 선점하고 나머지는 기존 작업에 붙는다", () => {
    const judgmentId = seedJudgment();
    const first = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    const second = claimGenerationJob(db, { ...base, judgmentId, workerId: "w2" });
    const third = claimGenerationJob(db, { ...base, judgmentId, workerId: "w3" });

    expect(first.kind).toBe("claimed");
    expect(second.kind).toBe("running");
    expect(third.kind).toBe("running");
    expect(second.jobId).toBe(first.jobId);
    expect(third.jobId).toBe(first.jobId);
  });

  it("끝난 작업은 done으로 알린다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    finishGenerationJob(db, claim.jobId, { ok: true });

    expect(claimGenerationJob(db, { ...base, judgmentId, workerId: "w2" }).kind).toBe("done");
  });

  it("실패한 작업은 다시 선점할 수 있다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    finishGenerationJob(db, claim.jobId, { ok: false, error: "모델 응답 없음" });

    const retry = claimGenerationJob(db, { ...base, judgmentId, workerId: "w2" });
    expect(retry.kind).toBe("claimed");
    expect(retry.jobId).toBe(claim.jobId);
  });

  it("heartbeat가 멈춘 좀비 작업을 회수한다", () => {
    const judgmentId = seedJudgment();
    const start = new Date("2026-08-28T00:00:00Z");
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1", now: start });
    expect(claim.kind).toBe("claimed");

    const stillFresh = new Date(start.getTime() + STALE_AFTER_MS - 1_000);
    expect(
      claimGenerationJob(db, { ...base, judgmentId, workerId: "w2", now: stillFresh }).kind,
    ).toBe("running");

    const wayLater = new Date(start.getTime() + STALE_AFTER_MS + 1_000);
    const reclaimed = claimGenerationJob(db, {
      ...base,
      judgmentId,
      workerId: "w2",
      now: wayLater,
    });
    expect(reclaimed.kind).toBe("claimed");
    expect(reclaimed.jobId).toBe(claim.jobId);
  });

  it("heartbeat를 갱신하면 좀비로 회수되지 않는다", () => {
    const judgmentId = seedJudgment();
    const start = new Date("2026-08-28T00:00:00Z");
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1", now: start });

    const later = new Date(start.getTime() + STALE_AFTER_MS + 1_000);
    heartbeatGenerationJob(db, claim.jobId, later);

    const check = new Date(later.getTime() + 1_000);
    expect(claimGenerationJob(db, { ...base, judgmentId, workerId: "w2", now: check }).kind).toBe(
      "running",
    );
  });

  it("레벨이 다르면 서로 막지 않는다", () => {
    const judgmentId = seedJudgment();
    expect(claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" }).kind).toBe("claimed");
    expect(
      claimGenerationJob(db, { judgmentId, level: "L4", promptVersion: "v1", workerId: "w1" }).kind,
    ).toBe("claimed");
  });
});

describe("recordLookupMiss", () => {
  it("같은 사건번호를 다시 찾으면 횟수를 올린다", () => {
    recordLookupMiss(db, "2026구합99999", new Date("2026-08-28T00:00:00Z"));
    recordLookupMiss(db, "2026구합99999", new Date("2026-08-29T00:00:00Z"));

    const row = db.select().from(lookupMiss).all()[0];
    expect(row?.count).toBe(2);
    expect(row?.lastTriedAt).toEqual(new Date("2026-08-29T00:00:00Z"));
    expect(row?.firstTriedAt).toEqual(new Date("2026-08-28T00:00:00Z"));
  });
});
