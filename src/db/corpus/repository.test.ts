import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GenerationSnapshot } from "@/lib/generation-snapshot";
import { STALE_AFTER_MS } from "@/lib/timing";
import type { CorpusDb } from "../client";
import { createTestCorpusDb } from "../testing";
import {
  claimGenerationJob,
  claimStructureGenerationJob,
  countGenerationsOn,
  createEditedRendition,
  findApprovedRendition,
  findContentReleaseBundle,
  findGenerationProgress,
  findJudgmentByCaseNo,
  findJudgmentRevision,
  findLatestRendition,
  findLawArticle,
  findLawVersionAt,
  findLawVersionByMst,
  findPublishedAudio,
  findPublishedRendition,
  findPublishedSentenceContext,
  findRendition,
  findRenditionAtRevision,
  findRenditionById,
  finishGenerationJob,
  finishStructureGenerationJob,
  heartbeatGenerationJob,
  heartbeatStructureGenerationJob,
  listJudgmentRevisionSummaries,
  listJudgmentRevisions,
  listLawArticles,
  listRecentGenerationFailures,
  listRenditionReleaseOverview,
  listSentences,
  listSpans,
  listStructureNodes,
  publishRendition,
  recordLookupMiss,
  reserveGenerationSlot,
  restoreContentRelease,
  reviewRendition,
  saveJudgmentText,
  saveLawArticles,
  saveRendition,
  saveStructure,
  setGenerationStage,
  upsertJudgment,
  upsertLawVersions,
  withdrawPublishedRendition,
} from "./repository";
import {
  contentRelease,
  generationJob,
  judgmentSpan,
  lookupMiss,
  rendition,
  renditionAudio,
  structureGenerationJob,
  structureNode,
} from "./schema";

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

/** 시험에서 쓰는 추출 프롬프트 판. 값이 무엇인지는 중요하지 않고, **같은 판인가**만 본다. */
const PROMPT = "extract-test";

const GENERATION_SNAPSHOT: GenerationSnapshot = {
  schemaVersion: "generation-snapshot-v1",
  providerId: "test-provider",
  generationModel: "test-model",
  verificationModel: "test-model",
  extractPromptVersion: "extract-test",
  renderPromptVersion: "render-test",
  entailPromptVersion: "entail-test",
  rulesVersion: "rules-test",
  readerPerspective: "neutral-reader-v1",
  safetyPolicyVersion: "grounded-output-v1",
};

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

  it("다른 원문을 다시 저장하면 이전 판을 보존하고 현재 판만 전환한다", () => {
    const id = seedJudgment();
    const old = saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "옛 문장" },
    ]);
    const current = saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "새 문장" },
    ]);

    expect(current.revisionId).not.toBe(old.revisionId);
    expect(current.revisionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(listSpans(db, id).map((span) => span.text)).toEqual(["새 문장"]);
    expect(listJudgmentRevisions(db, id)).toHaveLength(2);
    expect(listJudgmentRevisionSummaries(db, id).map(({ spans }) => spans)).toEqual([1, 1]);
    expect(
      db
        .select()
        .from(judgmentSpan)
        .all()
        .map((span) => span.text),
    ).toEqual(["옛 문장", "새 문장"]);
  });

  it("같은 내용을 다시 받으면 새 판과 span을 만들지 않는다", () => {
    const id = seedJudgment();
    const spans = [{ paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "같은 문장" }];
    const first = saveJudgmentText(db, id, spans);
    const second = saveJudgmentText(db, id, spans);

    expect(first.created).toBe(true);
    expect(second).toEqual({ revisionId: first.revisionId, created: false });
    expect(listJudgmentRevisions(db, id)).toHaveLength(1);
    expect(db.select().from(judgmentSpan).all()).toHaveLength(1);
  });

  it("다른 판결문의 원문판 ID로 문장과 원문판을 읽을 수 없다", () => {
    const id = seedJudgment();
    const other = seedJudgment("2020다2222");
    const revision = saveJudgmentText(db, other, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 6, text: "다른 판결문" },
    ]);

    expect(listSpans(db, id, revision.revisionId)).toEqual([]);
    expect(findJudgmentRevision(db, id, revision.revisionId)).toBeUndefined();
  });

  it("원문판이 바뀌면 구 설명을 현재 판의 캐시로 반환하지 않는다", () => {
    const id = seedJudgment();
    const old = saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "옛 문장" },
    ]);
    const renditionId = saveRendition(db, {
      judgmentId: id,
      level: "L4",
      model: "test-model",
      promptVersion: "v1",
      sentences: [],
    });

    saveJudgmentText(db, id, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "새 문장" },
    ]);

    expect(findRendition(db, id, "L4", "v1")).toBeUndefined();
    expect(
      findRenditionAtRevision(db, {
        judgmentId: id,
        sourceRevisionId: old.revisionId,
        level: "L4",
        promptVersion: "v1",
      })?.id,
    ).toBe(renditionId);
  });
});

describe("saveRendition", () => {
  it("현재 자동 생성 키가 달라도 현재 원문판의 승인 편집본을 찾는다", () => {
    const judgmentId = seedJudgment();
    const approvedId = saveRendition(db, {
      judgmentId,
      level: "L4",
      model: "editorial",
      promptVersion: "editorial-v1",
      reviewState: "approved",
      sentences: [],
    });

    expect(findRendition(db, judgmentId, "L4", "runtime-v2")).toBeUndefined();
    expect(findApprovedRendition(db, judgmentId, "L4")?.id).toBe(approvedId);
  });

  it("생성 설정 스냅샷을 결과와 함께 보존한다", () => {
    const judgmentId = seedJudgment();
    saveRendition(db, {
      judgmentId,
      level: "L2",
      model: "test-model",
      promptVersion: "v1",
      generationSnapshot: GENERATION_SNAPSHOT,
      sentences: [],
    });

    expect(findRendition(db, judgmentId, "L2", "v1")?.generationSnapshot).toEqual(
      GENERATION_SNAPSHOT,
    );
  });

  it("편집 검수를 마친 설명의 상태를 보존한다", () => {
    const judgmentId = seedJudgment();
    saveRendition(db, {
      judgmentId,
      level: "L1",
      model: "editorial",
      promptVersion: "v1",
      reviewState: "approved",
      sentences: [],
    });

    expect(findRendition(db, judgmentId, "L1", "v1")?.reviewState).toBe("approved");
  });

  it("문장에 연결된 구조 노드의 원문 span을 함께 돌려준다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 6, text: "원문 근거." },
    ]);
    const spanId = listSpans(db, judgmentId)[0]?.id;
    expect(spanId).toBeDefined();
    saveStructure(db, judgmentId, PROMPT, [
      {
        kind: "claim",
        payload: { text: "근거" },
        orderIdx: 0,
        spanIds: [spanId as string],
      },
    ]);
    const nodeId = listStructureNodes(db, judgmentId, PROMPT)[0]?.id;
    expect(nodeId).toBeDefined();

    const renditionId = saveRendition(db, {
      judgmentId,
      level: "L4",
      model: "test-model",
      promptVersion: "v1",
      sentences: [
        {
          orderIdx: 0,
          text: "쉽게 말하면요.",
          structureNodeId: nodeId,
          confidence: "grounded",
        },
      ],
    });

    expect(listSentences(db, renditionId)[0]?.sourceSpanIds).toEqual([spanId]);
  });

  /*
   * **본문을 다시 만들면 음성도 따라 지워져야 한다.**
   *
   * 설명을 새 모델·새 프롬프트로 다시 만들면 문장이 달라진다. 그때 옛 음성이 남아 있으면
   * **글과 소리가 어긋난다** — 화면에는 새 문장이 있는데 귀에는 옛 문장이 들린다.
   * 그것은 틀린 설명보다 알아채기 어렵다.
   *
   * 구조가 그것을 보장한다(음성이 문장 표에 매여 있고 cascade가 걸려 있다). 스키마를
   * 손대다 그 연결이 끊어지는 일을 막으려고 여기서 지킨다.
   */
  it("변환본을 지우면 그 음성도 함께 지워진다", () => {
    const judgmentId = seedJudgment();
    const renditionId = saveRendition(db, {
      judgmentId,
      level: "L4",
      model: "test-model",
      promptVersion: "v1",
      sentences: [{ orderIdx: 0, text: "옛 문장이에요.", confidence: "grounded" }],
    });

    const sentenceId = listSentences(db, renditionId)[0]?.id as string;
    db.insert(renditionAudio)
      .values({
        sentenceId,
        voice: "KR",
        model: "test-tts",
        format: "mp3",
        bytes: Buffer.from([1, 2, 3]),
      })
      .run();
    expect(db.select().from(renditionAudio).all()).toHaveLength(1);

    db.delete(rendition).where(eq(rendition.id, renditionId)).run();

    expect(db.select().from(renditionAudio).all()).toHaveLength(0);
  });

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

  it("프롬프트 버전과 관계없이 같은 단계에서 가장 최근 설명을 찾는다", () => {
    const judgmentId = seedJudgment();
    const olderId = saveRendition(db, {
      judgmentId,
      level: "L2",
      model: "old-model",
      promptVersion: "old-prompt",
      sentences: [{ orderIdx: 0, text: "예전 설명", confidence: "grounded" }],
    });
    const newerId = saveRendition(db, {
      judgmentId,
      level: "L2",
      model: "new-model",
      promptVersion: "new-prompt",
      sentences: [{ orderIdx: 0, text: "새 설명", confidence: "grounded" }],
    });

    db.update(rendition)
      .set({ generatedAt: new Date("2026-09-01T00:00:00Z") })
      .where(eq(rendition.id, olderId))
      .run();
    db.update(rendition)
      .set({ generatedAt: new Date("2026-09-02T00:00:00Z") })
      .where(eq(rendition.id, newerId))
      .run();

    expect(findLatestRendition(db, judgmentId, "L2")?.id).toBe(newerId);
    expect(findLatestRendition(db, judgmentId, "L4")).toBeUndefined();
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

describe("사람이 고친 설명", () => {
  it("기존 설명을 보존하고 고친 문장만 확인 필요인 새 초안을 만든다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 8, text: "원문 문장입니다." },
    ]);
    const baseRenditionId = saveRendition(db, {
      judgmentId,
      level: "L4",
      model: "model",
      promptVersion: "edit-base-v1",
      sentences: [
        { orderIdx: 0, role: "heading", text: "결과", confidence: "grounded" },
        { orderIdx: 1, text: "처음 설명이에요.", confidence: "grounded" },
      ],
    });
    const baseSentences = listSentences(db, baseRenditionId);
    const result = createEditedRendition(db, {
      judgmentId,
      baseRenditionId,
      sentences: baseSentences.map((sentence) => ({
        id: sentence.id,
        text: sentence.role === "body" ? "고친 설명이에요." : sentence.text,
      })),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(listSentences(db, baseRenditionId).map(({ text }) => text)).toContain(
      "처음 설명이에요.",
    );
    expect(listSentences(db, result.renditionId)).toMatchObject([
      { role: "heading", text: "결과", confidence: "grounded" },
      { role: "body", text: "고친 설명이에요.", confidence: "needs_check" },
    ]);
    expect(findRenditionById(db, judgmentId, result.renditionId)).toMatchObject({
      model: "human-editor",
      reviewState: "none",
    });
    expect(findLatestRendition(db, judgmentId, "L4")?.id).toBe(result.renditionId);
  });

  it("낱말 뜻을 출처와 따로 고치거나 같은 내용을 중복 저장하지 않는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 2, text: "원문" },
    ]);
    const baseRenditionId = saveRendition(db, {
      judgmentId,
      level: "L2",
      model: "model",
      promptVersion: "edit-gloss-v1",
      sentences: [
        {
          orderIdx: 0,
          role: "gloss",
          text: "변제는 빚을 갚는 일이에요.",
          source: "표준국어대사전",
          confidence: "grounded",
        },
      ],
    });
    const [sentence] = listSentences(db, baseRenditionId);
    expect(sentence).toBeDefined();
    expect(
      createEditedRendition(db, {
        judgmentId,
        baseRenditionId,
        sentences: [{ id: sentence?.id ?? "", text: "다른 뜻" }],
      }),
    ).toEqual({ ok: false, reason: "invalid_sentences" });
    expect(
      createEditedRendition(db, {
        judgmentId,
        baseRenditionId,
        sentences: [{ id: sentence?.id ?? "", text: sentence?.text ?? "" }],
      }),
    ).toEqual({ ok: false, reason: "invalid_sentences" });
  });

  it("원문판이 바뀐 뒤에는 옛 설명을 편집 초안으로 만들지 않는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "옛 원문" },
    ]);
    const baseRenditionId = saveRendition(db, {
      judgmentId,
      level: "L3",
      model: "model",
      promptVersion: "edit-stale-v1",
      sentences: [{ orderIdx: 0, text: "옛 설명", confidence: "grounded" }],
    });
    const [sentence] = listSentences(db, baseRenditionId);
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 3, text: "새 원문" },
    ]);

    expect(
      createEditedRendition(db, {
        judgmentId,
        baseRenditionId,
        sentences: [{ id: sentence?.id ?? "", text: "새 설명" }],
      }),
    ).toEqual({ ok: false, reason: "stale" });
  });
});

describe("content release", () => {
  function renditionFor(judgmentId: string, level: "L1" | "L2" | "L3" | "L4", text: string) {
    const renditionId = saveRendition(db, {
      judgmentId,
      level,
      model: "editorial",
      promptVersion: `editorial-${level}-${text}`,
      sentences: [{ orderIdx: 0, text, confidence: "grounded" }],
    });
    const requested = reviewRendition(db, { judgmentId, renditionId, state: "pending" });
    if (!requested.ok) {
      throw new Error(`테스트 설명의 검수를 요청하지 못했어요: ${requested.reason}`);
    }
    const result = reviewRendition(db, { judgmentId, renditionId, state: "approved" });
    if (!result.ok) {
      throw new Error(`테스트 설명을 승인하지 못했어요: ${result.reason}`);
    }
    return renditionId;
  }

  it("검수 승인을 받지 않은 설명은 게시하지 않는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const renditionId = saveRendition(db, {
      judgmentId,
      level: "L4",
      model: "editorial",
      promptVersion: "draft-v1",
      sentences: [{ orderIdx: 0, text: "초안", confidence: "grounded" }],
    });

    expect(publishRendition(db, { judgmentId, renditionId })).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(reviewRendition(db, { judgmentId, renditionId, state: "pending" })).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(reviewRendition(db, { judgmentId, renditionId, state: "approved" })).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(publishRendition(db, { judgmentId, renditionId })).toMatchObject({ ok: true });
    const sentenceId = listSentences(db, renditionId)[0]?.id;
    expect(sentenceId).toBeDefined();
    expect(findPublishedSentenceContext(db, sentenceId as string)).toMatchObject({
      judgmentId,
      renditionId,
      sentenceId,
    });
  });

  it("검수 요청 없이 승인하거나 승인된 설명을 작성 단계로 되돌리지 않는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const renditionId = saveRendition(db, {
      judgmentId,
      level: "L2",
      model: "editorial",
      promptVersion: "review-transition-v1",
      sentences: [{ orderIdx: 0, text: "설명", confidence: "grounded" }],
    });

    expect(reviewRendition(db, { judgmentId, renditionId, state: "approved" })).toEqual({
      ok: false,
      reason: "invalid_review_state",
    });
    expect(reviewRendition(db, { judgmentId, renditionId, state: "pending" })).toMatchObject({
      ok: true,
    });
    expect(reviewRendition(db, { judgmentId, renditionId, state: "approved" })).toMatchObject({
      ok: true,
    });
    expect(reviewRendition(db, { judgmentId, renditionId, state: "pending" })).toEqual({
      ok: false,
      reason: "invalid_review_state",
    });
  });

  it("승인 상태만으로는 공개하지 않고 릴리스 포인터가 가리킨 변환본만 공개한다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const renditionId = renditionFor(judgmentId, "L4", "쉬운 설명");

    expect(findPublishedRendition(db, judgmentId, "L4")).toBeUndefined();
    expect(publishRendition(db, { judgmentId, renditionId, actorId: "admin-1" })).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(findPublishedRendition(db, judgmentId, "L4")?.id).toBe(renditionId);
    expect(listRenditionReleaseOverview(db, judgmentId)[3]).toMatchObject({
      level: "L4",
      state: "published",
      publishedRenditionId: renditionId,
      sentences: 1,
    });
  });

  it("음성도 게시된 현재 원문판의 문장일 때만 공개한다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const renditionId = renditionFor(judgmentId, "L4", "소리로 읽을 설명");
    const sentenceId = listSentences(db, renditionId)[0]?.id as string;
    db.insert(renditionAudio)
      .values({
        sentenceId,
        voice: "KR",
        model: "test-tts",
        format: "mp3",
        bytes: Buffer.from([1, 2, 3]),
      })
      .run();

    expect(findPublishedAudio(db, sentenceId)).toBeUndefined();
    publishRendition(db, { judgmentId, renditionId });
    expect(findPublishedAudio(db, sentenceId)?.bytes).toEqual(Buffer.from([1, 2, 3]));

    withdrawPublishedRendition(db, { judgmentId, level: "L4" });
    expect(findPublishedAudio(db, sentenceId)).toBeUndefined();
  });

  it("레벨 하나를 게시할 때 기존 공개 레벨을 새 불변 릴리스에 함께 잇는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const l2 = renditionFor(judgmentId, "L2", "법률 설명");
    const l4 = renditionFor(judgmentId, "L4", "아주 쉬운 설명");
    publishRendition(db, { judgmentId, renditionId: l2 });
    publishRendition(db, { judgmentId, renditionId: l4 });

    expect(findPublishedRendition(db, judgmentId, "L2")?.id).toBe(l2);
    expect(findPublishedRendition(db, judgmentId, "L4")?.id).toBe(l4);
    expect(db.select().from(contentRelease).all()).toHaveLength(2);
  });

  it("한 레벨을 철회하면 다른 공개 레벨은 유지하고 철회 이력을 남긴다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const l2 = renditionFor(judgmentId, "L2", "법률 설명");
    const l4 = renditionFor(judgmentId, "L4", "아주 쉬운 설명");
    publishRendition(db, { judgmentId, renditionId: l2 });
    publishRendition(db, { judgmentId, renditionId: l4 });

    expect(withdrawPublishedRendition(db, { judgmentId, level: "L4" })).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(findPublishedRendition(db, judgmentId, "L4")).toBeUndefined();
    expect(findPublishedRendition(db, judgmentId, "L2")?.id).toBe(l2);
    expect(db.select().from(contentRelease).all()).toHaveLength(3);
  });

  it("원문판이 바뀌면 옛 릴리스를 현재 설명으로 공개하지 않는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "옛 원문" },
    ]);
    const renditionId = renditionFor(judgmentId, "L4", "옛 설명");
    publishRendition(db, { judgmentId, renditionId });
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "새 원문" },
    ]);

    expect(findPublishedRendition(db, judgmentId, "L4")).toBeUndefined();
    expect(listRenditionReleaseOverview(db, judgmentId)[3]?.state).toBe("stale");
  });

  it("근거 없음 문장이 든 변환본은 게시를 막는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const renditionId = saveRendition(db, {
      judgmentId,
      level: "L4",
      model: "editorial",
      promptVersion: "bad-v1",
      sentences: [{ orderIdx: 0, text: "근거 없는 설명", confidence: "ungrounded" }],
    });

    expect(reviewRendition(db, { judgmentId, renditionId, state: "approved" })).toEqual({
      ok: false,
      reason: "ungrounded",
    });
    expect(publishRendition(db, { judgmentId, renditionId })).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(findPublishedRendition(db, judgmentId, "L4")).toBeUndefined();
  });

  it("과거 묶음을 복원해도 과거 행을 바꾸지 않고 새 릴리스를 남긴다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const first = renditionFor(judgmentId, "L4", "첫 설명");
    const second = renditionFor(judgmentId, "L4", "둘째 설명");
    const firstRelease = publishRendition(db, { judgmentId, renditionId: first });
    publishRendition(db, { judgmentId, renditionId: second });
    if (!firstRelease.ok || firstRelease.releaseId === null) {
      throw new Error("첫 릴리스를 만들지 못했습니다.");
    }

    expect(
      restoreContentRelease(db, {
        judgmentId,
        releaseId: firstRelease.releaseId,
        actorId: "admin",
      }),
    ).toMatchObject({ ok: true, changed: true });
    expect(findPublishedRendition(db, judgmentId, "L4")?.id).toBe(first);
    expect(db.select().from(contentRelease).all()).toHaveLength(3);
    expect(db.select().from(contentRelease).all().at(-1)?.action).toBe("restore");
  });

  it("다른 원문판의 릴리스는 현재판으로 복원하지 않는다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "옛 원문" },
    ]);
    const renditionId = renditionFor(judgmentId, "L2", "옛 설명");
    const released = publishRendition(db, { judgmentId, renditionId });
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "새 원문" },
    ]);
    if (!released.ok || released.releaseId === null) {
      throw new Error("릴리스를 만들지 못했습니다.");
    }

    expect(restoreContentRelease(db, { judgmentId, releaseId: released.releaseId })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("과거 릴리스 비교는 당시의 정확한 변환본과 문장을 돌려준다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const first = renditionFor(judgmentId, "L4", "첫 설명");
    const firstRelease = publishRendition(db, { judgmentId, renditionId: first });
    const second = renditionFor(judgmentId, "L4", "둘째 설명");
    publishRendition(db, { judgmentId, renditionId: second });
    if (!firstRelease.ok || firstRelease.releaseId === null) {
      throw new Error("첫 릴리스를 만들지 못했습니다.");
    }

    expect(findContentReleaseBundle(db, judgmentId, firstRelease.releaseId)?.renditions).toEqual([
      expect.objectContaining({
        level: "L4",
        renditionId: first,
        sentences: [expect.objectContaining({ text: "첫 설명" })],
      }),
    ]);
    expect(
      findContentReleaseBundle(db, "another-judgment", firstRelease.releaseId),
    ).toBeUndefined();
  });
});

describe("claimStructureGenerationJob", () => {
  it("서로 다른 레벨 작업도 같은 원문판·추출판에서는 구조를 한 번만 선점한다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);

    const first = claimStructureGenerationJob(db, {
      judgmentId,
      promptVersion: PROMPT,
      workerId: "l2-worker",
    });
    const second = claimStructureGenerationJob(db, {
      judgmentId,
      promptVersion: PROMPT,
      workerId: "l4-worker",
    });

    expect(first.kind).toBe("claimed");
    expect(second).toEqual({ kind: "running", jobId: first.jobId });
    expect(db.select().from(structureGenerationJob).all()).toHaveLength(1);
  });

  it("완료된 구조 작업을 재사용하고 heartbeat가 끊긴 작업은 회수한다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "원문" },
    ]);
    const start = new Date("2026-09-08T00:00:00Z");
    const first = claimStructureGenerationJob(db, {
      judgmentId,
      promptVersion: PROMPT,
      workerId: "w1",
      now: start,
    });
    if (first.kind !== "claimed") {
      throw new Error("구조 작업을 선점하지 못했습니다.");
    }
    const beat = new Date(start.getTime() + STALE_AFTER_MS - 1_000);
    heartbeatStructureGenerationJob(db, first.jobId, beat);
    expect(
      claimStructureGenerationJob(db, {
        judgmentId,
        promptVersion: PROMPT,
        workerId: "w2",
        now: new Date(start.getTime() + STALE_AFTER_MS + 1_000),
      }).kind,
    ).toBe("running");

    const reclaimed = claimStructureGenerationJob(db, {
      judgmentId,
      promptVersion: PROMPT,
      workerId: "w3",
      now: new Date(beat.getTime() + STALE_AFTER_MS + 1_000),
    });
    expect(reclaimed).toEqual({ kind: "claimed", jobId: first.jobId });
    finishStructureGenerationJob(db, first.jobId, { ok: true });
    expect(
      claimStructureGenerationJob(db, {
        judgmentId,
        promptVersion: PROMPT,
        workerId: "w4",
      }),
    ).toEqual({ kind: "done", jobId: first.jobId });
  });

  it("원문판이 바뀌면 새 구조 작업을 별도로 선점한다", () => {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 4, text: "첫 원문" },
    ]);
    const first = claimStructureGenerationJob(db, {
      judgmentId,
      promptVersion: PROMPT,
      workerId: "w1",
    });
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 5, text: "바뀐 원문" },
    ]);
    const second = claimStructureGenerationJob(db, {
      judgmentId,
      promptVersion: PROMPT,
      workerId: "w2",
    });

    expect(first.kind).toBe("claimed");
    expect(second.kind).toBe("claimed");
    expect(second.jobId).not.toBe(first.jobId);
  });
});

describe("claimGenerationJob", () => {
  const base = { level: "L2" as const, promptVersion: "v1" };

  it("선점 순간의 생성 설정을 작업에 고정한다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, {
      ...base,
      judgmentId,
      generationSnapshot: GENERATION_SNAPSHOT,
      workerId: "w1",
    });

    expect(
      db.select().from(generationJob).where(eq(generationJob.id, claim.jobId)).get()
        ?.generationSnapshot,
    ).toEqual(GENERATION_SNAPSHOT);
  });

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

  /*
   * 실패 이유가 하나였을 때, 그 하나를 판결문 페이지가 읽었다. 그래서 AI API 주소와
   * 제공자 오류 본문이 아무나 여는 화면에 찍혔다. 이제 화면이 읽는 것과 관리자가 읽는
   * 것이 다른 열이다.
   */
  it("공개 화면이 읽는 값에는 운영자용 원인이 섞이지 않는다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    finishGenerationJob(db, claim.jobId, {
      ok: false,
      reason: "지금은 AI 서버가 답하지 않아요.",
      detail: "AI 서버 응답이 401입니다. Incorrect API key provided: sk-live-9f2c",
    });

    const progress = findGenerationProgress(db, { ...base, judgmentId });
    expect(progress?.error).toBe("지금은 AI 서버가 답하지 않아요.");
    expect(progress?.error).not.toContain("sk-live-9f2c");

    // 관리자 화면은 둘 다 본다 — 무엇을 보여 줬고 실은 무엇이었는지.
    const [failure] = listRecentGenerationFailures(db, 10);
    expect(failure?.shown).toBe("지금은 AI 서버가 답하지 않아요.");
    expect(failure?.detail).toContain("sk-live-9f2c");
  });

  it("실패한 작업은 다시 선점할 수 있다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    finishGenerationJob(db, claim.jobId, {
      ok: false,
      reason: "모델 응답 없음",
      detail: "운영자용 자세한 원인",
    });

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

describe("saveStructure", () => {
  /** 판결문 하나와 문장 두 개. 구조 노드가 근거로 삼을 span을 만든다. */
  function seedWithSpans(): { judgmentId: string; spanIds: string[] } {
    const judgmentId = seedJudgment();
    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 10, text: "원고는 …" },
      { paraIdx: 0, sentIdx: 1, charStart: 11, charEnd: 20, text: "피고는 …" },
    ]);
    return { judgmentId, spanIds: listSpans(db, judgmentId).map((span) => span.id) };
  }

  it("노드와 근거 연결을 함께 저장하고 순서대로 읽는다", () => {
    const { judgmentId, spanIds } = seedWithSpans();

    saveStructure(db, judgmentId, PROMPT, [
      {
        kind: "issue",
        payload: { text: "소멸시효가 지났는가" },
        orderIdx: 1,
        spanIds: [spanIds[1] as string],
      },
      {
        kind: "fact_event",
        payload: { text: "계약을 맺었다" },
        occurredOn: new Date("2019-05-03T00:00:00Z"),
        orderIdx: 0,
        spanIds,
      },
    ]);

    const nodes = listStructureNodes(db, judgmentId, PROMPT);
    expect(nodes.map((node) => node.kind)).toEqual(["fact_event", "issue"]);
    expect(nodes[0]?.payload).toEqual({ text: "계약을 맺었다" });
    expect(nodes[0]?.occurredOn).toEqual(new Date("2019-05-03T00:00:00Z"));
    expect([...(nodes[0]?.spanIds ?? [])].sort()).toEqual([...spanIds].sort());
    expect(nodes[1]?.spanIds).toEqual([spanIds[1]]);
  });

  it("근거 span이 없는 노드를 받지 않는다 — P2를 여기서 막는다", () => {
    const { judgmentId } = seedWithSpans();

    expect(() =>
      saveStructure(db, judgmentId, PROMPT, [
        { kind: "holding", payload: { text: "…" }, orderIdx: 0, spanIds: [] },
      ]),
    ).toThrow("근거 span이 없는");
  });

  it("다른 판결문의 span을 근거로 받지 않는다 — 외래 키는 이것을 못 막는다", () => {
    const { judgmentId } = seedWithSpans();

    const other = seedJudgment("2020다1111");
    saveJudgmentText(db, other, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 5, text: "남의 판결문" },
    ]);
    const otherSpan = listSpans(db, other)[0]?.id as string;

    expect(() =>
      saveStructure(db, judgmentId, PROMPT, [
        { kind: "holding", payload: { text: "…" }, orderIdx: 0, spanIds: [otherSpan] },
      ]),
    ).toThrow("이 판결문의 span이 아닙니다");
  });

  it("하나라도 어긋나면 옛 구조를 지우지도, 새 구조를 넣지도 않는다", () => {
    const { judgmentId, spanIds } = seedWithSpans();
    saveStructure(db, judgmentId, PROMPT, [
      {
        kind: "issue",
        payload: { text: "멀쩡한 것" },
        orderIdx: 0,
        spanIds: [spanIds[0] as string],
      },
    ]);

    expect(() =>
      saveStructure(db, judgmentId, PROMPT, [
        { kind: "issue", payload: { text: "새 것" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
        { kind: "holding", payload: {}, orderIdx: 1, spanIds: ["없는-span"] },
      ]),
    ).toThrow();

    // 검사를 트랜잭션 **앞에서** 하므로 옛 구조가 그대로 남아야 한다.
    const nodes = listStructureNodes(db, judgmentId, PROMPT);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.payload).toEqual({ text: "멀쩡한 것" });
  });

  it("같은 span을 두 번 적어 와도 한 번만 잇는다", () => {
    const { judgmentId, spanIds } = seedWithSpans();
    const spanId = spanIds[0] as string;

    saveStructure(db, judgmentId, PROMPT, [
      { kind: "conclusion", payload: {}, orderIdx: 0, spanIds: [spanId, spanId] },
    ]);

    expect(listStructureNodes(db, judgmentId, PROMPT)[0]?.spanIds).toEqual([spanId]);
  });

  /*
   * 레벨 둘을 함께 돌리면 둘 다 "구조가 없다"를 보고 각자 추출한다. 나중에 저장한 쪽이
   * 앞선 쪽의 노드를 지우면, 그 id로 문장을 넣던 작업이 `FOREIGN KEY constraint failed`로
   * 끝난다 — 실제로 L2·L4를 함께 돌려 재현했다.
   */
  it("이미 구조가 있으면 덮어쓰지 않는다 — 그 id로 문장을 만드는 작업이 있을 수 있다", () => {
    const { judgmentId, spanIds } = seedWithSpans();

    const first = saveStructure(db, judgmentId, PROMPT, [
      { kind: "issue", payload: { text: "먼저 것" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
    ]);
    const second = saveStructure(db, judgmentId, PROMPT, [
      { kind: "issue", payload: { text: "나중 것" }, orderIdx: 0, spanIds: [spanIds[1] as string] },
    ]);

    // 뒤에 온 쪽도 **쓸 수 있는 id**를 받는다. 빈 배열이나 없는 id를 주면 거기서 깨진다.
    expect(second).toEqual(first);

    const nodes = listStructureNodes(db, judgmentId, PROMPT);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.payload).toEqual({ text: "먼저 것" });
  });

  it("원문 갱신으로 근거 연결이 끊긴 구조는 무효화하고 새 span에 다시 연결한다", () => {
    const { judgmentId, spanIds } = seedWithSpans();
    const old = saveStructure(db, judgmentId, PROMPT, [
      { kind: "issue", payload: { text: "옛 분석" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
    ]);

    saveJudgmentText(db, judgmentId, [
      { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 12, text: "새로 받은 원문" },
    ]);
    const refreshedSpanId = listSpans(db, judgmentId)[0]?.id as string;

    // structure_node 자체가 남아 있어도 원문 근거가 없으면 재사용할 수 없다.
    expect(listStructureNodes(db, judgmentId, PROMPT)).toEqual([]);

    const fresh = saveStructure(db, judgmentId, PROMPT, [
      {
        kind: "holding",
        payload: { text: "새 분석" },
        orderIdx: 0,
        spanIds: [refreshedSpanId],
      },
    ]);

    expect(fresh).not.toEqual(old);
    expect(listStructureNodes(db, judgmentId, PROMPT)).toMatchObject([
      { kind: "holding", payload: { text: "새 분석" }, spanIds: [refreshedSpanId] },
    ]);
  });

  /*
   * 지시문을 고치는 이유는 앞선 판이 잘못 뽑았기 때문이다. 판을 보지 않으면 이미 처리한
   * 판결문은 영영 옛 결과를 쓴다 — 고친 보람이 없다.
   */
  it("추출 프롬프트 판이 다르면 따로 뽑고, 옛 것을 지우지 않는다", () => {
    const { judgmentId, spanIds } = seedWithSpans();

    const old = saveStructure(db, judgmentId, "extract-v1", [
      { kind: "issue", payload: { text: "옛 판" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
    ]);
    const fresh = saveStructure(db, judgmentId, "extract-v2", [
      { kind: "issue", payload: { text: "새 판" }, orderIdx: 0, spanIds: [spanIds[1] as string] },
    ]);

    expect(fresh).not.toEqual(old);

    // 각자 자기 판만 본다.
    expect(listStructureNodes(db, judgmentId, "extract-v1")[0]?.payload).toEqual({ text: "옛 판" });
    expect(listStructureNodes(db, judgmentId, "extract-v2")[0]?.payload).toEqual({ text: "새 판" });

    /*
     * **옛 노드는 남아 있다.** 그 id로 만들어진 옛 설명의 근거 링크가 살아 있어야 한다
     * (§6.4 — 기존 변환본은 지우지 않는다).
     */
    expect(listStructureNodes(db, judgmentId, "extract-v1")).toHaveLength(1);
  });

  it("구조를 지우고 다시 부르면 새로 넣는다 — 다시 뽑기는 명시적인 일이다", () => {
    const { judgmentId, spanIds } = seedWithSpans();

    saveStructure(db, judgmentId, PROMPT, [
      { kind: "issue", payload: { text: "옛 것" }, orderIdx: 0, spanIds: [spanIds[0] as string] },
    ]);
    db.delete(structureNode).where(eq(structureNode.judgmentId, judgmentId)).run();
    saveStructure(db, judgmentId, PROMPT, [
      { kind: "issue", payload: { text: "새 것" }, orderIdx: 0, spanIds: [spanIds[1] as string] },
    ]);

    const nodes = listStructureNodes(db, judgmentId, PROMPT);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.payload).toEqual({ text: "새 것" });
  });

  it("구조가 없는 판결문은 빈 배열을 낸다 — 추가 조회를 돌지 않는다", () => {
    const { judgmentId } = seedWithSpans();
    expect(listStructureNodes(db, judgmentId, PROMPT)).toEqual([]);
  });
});

describe("법령 판 목록", () => {
  /** 도로교통법의 실제 시행일 몇 개. `법령ID`는 같고 `MST`만 다르다. */
  const 도로교통법 = [
    { lawId: "001638", mst: "204786", name: "도로교통법", effectiveAt: new Date("2019-04-17") },
    { lawId: "001638", mst: "210001", name: "도로교통법", effectiveAt: new Date("2020-06-09") },
    { lawId: "001638", mst: "281875", name: "도로교통법", effectiveAt: new Date("2026-07-01") },
  ];

  it("판을 넣고 MST로 찾는다", () => {
    expect(upsertLawVersions(db, 도로교통법)).toBe(3);
  });

  it("같은 MST라도 시행일이 다르면 다른 판이다", () => {
    /*
     * 한 번의 개정 안에서도 조문마다 시행일이 다르다. 그래서 법제처 목록은 같은 mst를
     * 시행일만 바꿔 여러 번 준다 — 1쪽 500건 중 25건이 그랬다. mst에만 유일 제약을 걸면
     * 그 행들이 조용히 사라진다(실제로 1,500건 중 93건이 사라졌다).
     */
    expect(
      upsertLawVersions(db, [
        { lawId: "011349", mst: "228097", name: "119구조법", effectiveAt: new Date("2021-07-06") },
        { lawId: "011349", mst: "228097", name: "119구조법", effectiveAt: new Date("2022-01-06") },
      ]),
    ).toBe(2);
  });

  it("같은 MST를 다시 넣어도 늘지 않는다 — 동기화를 여러 번 돌려도 같다", () => {
    upsertLawVersions(db, 도로교통법);
    expect(upsertLawVersions(db, 도로교통법)).toBe(0);
  });

  it("이미 받아 둔 본문을 동기화가 지우지 않는다", () => {
    upsertLawVersions(db, 도로교통법);
    const version = findLawVersionAt(db, { lawId: "001638" }, new Date("2019-05-03"));
    saveLawArticles(db, version?.id as string, [{ articleNo: "3", clauses: [], orderIdx: 0 }]);

    // 과거 판은 변하지 않으므로 다시 받을 이유가 없다. 덮어쓰면 본문이 날아간다.
    upsertLawVersions(db, 도로교통법);
    expect(
      findLawVersionAt(db, { lawId: "001638" }, new Date("2019-05-03"))?.bodyFetchedAt,
    ).not.toBeNull();
    expect(listLawArticles(db, version?.id as string)).toHaveLength(1);
  });

  it("**그 날짜에 시행 중이던 판**을 고른다 — 현행이 아니다", () => {
    upsertLawVersions(db, 도로교통법);

    // 2019-05-03 판결이면 2019-04-17 시행판이 근거다. 2026년 판이 아니다.
    expect(findLawVersionAt(db, { lawId: "001638" }, new Date("2019-05-03"))?.mst).toBe("204786");
    expect(findLawVersionAt(db, { lawId: "001638" }, new Date("2021-01-01"))?.mst).toBe("210001");
  });

  it("시행일 당일이면 그 판이 맞다", () => {
    upsertLawVersions(db, 도로교통법);
    expect(findLawVersionAt(db, { lawId: "001638" }, new Date("2019-04-17"))?.mst).toBe("204786");
  });

  it("가장 오래된 시행일보다 앞이면 없다 — 없는 것을 지어내지 않는다", () => {
    upsertLawVersions(db, 도로교통법);
    expect(findLawVersionAt(db, { lawId: "001638" }, new Date("1990-01-01"))).toBeUndefined();
  });

  it("이름으로도 시점 조회가 된다 — 판결문은 법을 이름으로 인용한다", () => {
    upsertLawVersions(db, 도로교통법);
    expect(findLawVersionAt(db, { name: "도로교통법" }, new Date("2019-05-03"))?.mst).toBe(
      "204786",
    );
  });
});

describe("법령 조문", () => {
  function seedVersion(): string {
    upsertLawVersions(db, [
      { lawId: "001638", mst: "204786", name: "도로교통법", effectiveAt: new Date("2019-04-17") },
    ]);
    return findLawVersionAt(db, { lawId: "001638" }, new Date("2019-05-03"))?.id as string;
  }

  it("조문을 저장하고 순서대로 읽는다. 본문 받음 표시가 함께 찍힌다", () => {
    const versionId = seedVersion();
    saveLawArticles(db, versionId, [
      {
        articleNo: "3",
        title: "신호기",
        clauses: [{ number: "①", text: "① 시장등은…" }],
        orderIdx: 0,
      },
      { articleNo: "4", title: "종류", clauses: [], orderIdx: 1 },
    ]);

    const articles = listLawArticles(db, versionId);
    expect(articles.map((article) => article.articleNo)).toEqual(["3", "4"]);
    expect(articles[0]?.clauses).toEqual([{ number: "①", text: "① 시장등은…" }]);
    expect(findLawVersionByMst(db, "204786")?.bodyFetchedAt).toBeInstanceOf(Date);
  });

  it("제4조와 제4조의2가 함께 저장된다 — 조 번호만으로는 유일하지 않다", () => {
    const versionId = seedVersion();
    saveLawArticles(db, versionId, [
      { articleNo: "4", title: "교통안전시설의 종류", clauses: [], orderIdx: 0 },
      { articleNo: "4", branchNo: "2", title: "무인 교통단속용 장비", clauses: [], orderIdx: 1 },
    ]);

    expect(listLawArticles(db, versionId)).toHaveLength(2);
    expect(findLawArticle(db, versionId, "4")?.title).toBe("교통안전시설의 종류");
    expect(findLawArticle(db, versionId, "4", "2")?.title).toBe("무인 교통단속용 장비");
  });

  it("없는 조문은 undefined다", () => {
    const versionId = seedVersion();
    saveLawArticles(db, versionId, [{ articleNo: "3", clauses: [], orderIdx: 0 }]);

    expect(findLawArticle(db, versionId, "9999")).toBeUndefined();
    // 가지번호를 안 준 조회가 가지번호 있는 조문을 집어 오면 안 된다.
    expect(findLawArticle(db, versionId, "3", "2")).toBeUndefined();
  });

  it("다시 받으면 옛 조문을 남기지 않는다", () => {
    const versionId = seedVersion();
    saveLawArticles(db, versionId, [{ articleNo: "3", clauses: [], orderIdx: 0 }]);
    saveLawArticles(db, versionId, [{ articleNo: "5", clauses: [], orderIdx: 0 }]);

    expect(listLawArticles(db, versionId).map((a) => a.articleNo)).toEqual(["5"]);
  });
});

describe("조문별 시행일", () => {
  function seedVersion(): string {
    upsertLawVersions(db, [
      { lawId: "011349", mst: "228097", name: "119구조법", effectiveAt: new Date("2021-07-06") },
    ]);
    return findLawVersionAt(db, { lawId: "011349" }, new Date("2021-08-01"))?.id as string;
  }

  it("그날 아직 시행되지 않은 조문은 빼고 준다", () => {
    const versionId = seedVersion();
    saveLawArticles(db, versionId, [
      { articleNo: "1", clauses: [], effectiveAt: new Date("2021-07-06"), orderIdx: 0 },
      { articleNo: "2", clauses: [], effectiveAt: new Date("2022-01-06"), orderIdx: 1 },
    ]);

    // 2021-08-01 판결이면 제2조는 아직 시행 전이다. 근거로 붙이면 안 된다.
    expect(listLawArticles(db, versionId, new Date("2021-08-01")).map((a) => a.articleNo)).toEqual([
      "1",
    ]);
    expect(listLawArticles(db, versionId, new Date("2022-06-01")).map((a) => a.articleNo)).toEqual([
      "1",
      "2",
    ]);
  });

  it("날짜를 주지 않으면 전부 준다", () => {
    const versionId = seedVersion();
    saveLawArticles(db, versionId, [
      { articleNo: "1", clauses: [], effectiveAt: new Date("2021-07-06"), orderIdx: 0 },
      { articleNo: "2", clauses: [], effectiveAt: new Date("2022-01-06"), orderIdx: 1 },
    ]);

    expect(listLawArticles(db, versionId)).toHaveLength(2);
  });

  it("시행일이 없는 조문은 남긴다 — 없는 것을 버리는 쪽이 더 위험하다", () => {
    const versionId = seedVersion();
    saveLawArticles(db, versionId, [{ articleNo: "1", clauses: [], orderIdx: 0 }]);

    expect(listLawArticles(db, versionId, new Date("1990-01-01"))).toHaveLength(1);
  });
});

describe("reserveGenerationSlot", () => {
  it("상한까지는 떼어 주고 그 다음은 거절한다", () => {
    expect(reserveGenerationSlot(db, { day: "2026-09-04", limit: 2 })).toBe(true);
    expect(reserveGenerationSlot(db, { day: "2026-09-04", limit: 2 })).toBe(true);
    expect(reserveGenerationSlot(db, { day: "2026-09-04", limit: 2 })).toBe(false);
    expect(countGenerationsOn(db, "2026-09-04")).toBe(2);
  });

  it("거절해도 세지 않는다 — 거절이 다음 날 몫까지 갉아먹으면 안 된다", () => {
    reserveGenerationSlot(db, { day: "2026-09-04", limit: 1 });
    reserveGenerationSlot(db, { day: "2026-09-04", limit: 1 });
    reserveGenerationSlot(db, { day: "2026-09-04", limit: 1 });

    expect(countGenerationsOn(db, "2026-09-04")).toBe(1);
  });

  it("날이 바뀌면 다시 찬다", () => {
    reserveGenerationSlot(db, { day: "2026-09-04", limit: 1 });

    expect(reserveGenerationSlot(db, { day: "2026-09-05", limit: 1 })).toBe(true);
    expect(countGenerationsOn(db, "2026-09-04")).toBe(1);
  });

  it("상한을 내리면 이미 넘긴 날은 더 못 뗀다", () => {
    reserveGenerationSlot(db, { day: "2026-09-04", limit: 10 });
    reserveGenerationSlot(db, { day: "2026-09-04", limit: 10 });

    expect(reserveGenerationSlot(db, { day: "2026-09-04", limit: 1 })).toBe(false);
  });

  it("상한이 0 이하면 아무것도 떼지 않는다", () => {
    expect(reserveGenerationSlot(db, { day: "2026-09-04", limit: 0 })).toBe(false);
    expect(countGenerationsOn(db, "2026-09-04")).toBe(0);
  });

  it("센 적 없는 날은 0이다", () => {
    expect(countGenerationsOn(db, "2026-01-01")).toBe(0);
  });
});

describe("생성 진행 상태", () => {
  const base = { level: "L2" as const, promptVersion: "v1" };

  it("작업이 없으면 진행도 없다", () => {
    const judgmentId = seedJudgment();
    expect(findGenerationProgress(db, { ...base, judgmentId })).toBeUndefined();
  });

  it("단계를 적으면 그대로 읽힌다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    setGenerationStage(db, claim.jobId, "verify");

    expect(findGenerationProgress(db, { ...base, judgmentId })).toMatchObject({
      status: "running",
      stage: "verify",
    });
  });

  it("단계를 적는 것이 곧 heartbeat다 — 좀비로 회수되지 않는다", () => {
    const judgmentId = seedJudgment();
    const start = new Date("2026-09-04T00:00:00Z");
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1", now: start });

    const later = new Date(start.getTime() + STALE_AFTER_MS - 1_000);
    setGenerationStage(db, claim.jobId, "render", later);

    // 처음 선점한 시각으로는 이미 좀비지만, 단계를 적은 시각 기준으로는 살아 있다.
    const wouldBeStale = new Date(start.getTime() + STALE_AFTER_MS + 1_000);
    expect(
      claimGenerationJob(db, { ...base, judgmentId, workerId: "w2", now: wouldBeStale }).kind,
    ).toBe("running");
  });

  it("끝난 작업에는 단계가 남지 않는다 — 화면이 '아직 만드는 중'으로 읽는다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    setGenerationStage(db, claim.jobId, "save");
    finishGenerationJob(db, claim.jobId, { ok: true });

    expect(findGenerationProgress(db, { ...base, judgmentId })).toMatchObject({
      status: "done",
      stage: null,
    });
  });

  it("실패한 까닭을 남긴다", () => {
    const judgmentId = seedJudgment();
    const claim = claimGenerationJob(db, { ...base, judgmentId, workerId: "w1" });
    finishGenerationJob(db, claim.jobId, {
      ok: false,
      reason: "AI 서버에 연결하지 못했습니다",
      detail: "운영자용 자세한 원인",
    });

    expect(findGenerationProgress(db, { ...base, judgmentId })).toMatchObject({
      status: "failed",
      error: "AI 서버에 연결하지 못했습니다",
    });
  });
});
