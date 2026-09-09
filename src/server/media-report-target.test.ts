import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CorpusDb } from "@/db/client";
import {
  publishRendition,
  reviewRendition,
  saveJudgmentText,
  saveRendition,
  upsertJudgment,
  withdrawPublishedRendition,
} from "@/db/corpus/repository";
import { createTestCorpusDb } from "@/db/testing";
import { findCaseMedia } from "@/lib/case-media";
import { findPublishedMediaReportTarget } from "./media-report-target";

let db: CorpusDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestCorpusDb());
});

afterEach(() => close());

function publishL4() {
  const judgmentId = upsertJudgment(db, {
    caseNoCanonical: "2023다287663",
    caseNoDisplay: "2023다287663",
    court: "대법원",
    source: "law_go_kr",
  });
  saveJudgmentText(db, judgmentId, [
    { paraIdx: 0, sentIdx: 0, charStart: 0, charEnd: 2, text: "원문" },
  ]);
  const renditionId = saveRendition(db, {
    judgmentId,
    level: "L4",
    model: "test",
    promptVersion: "media-report-test",
    sentences: [
      {
        orderIdx: 0,
        role: "heading",
        text: "무슨 일이 있었나요",
        confidence: "grounded",
      },
      { orderIdx: 1, text: "쉬운 설명", confidence: "grounded" },
    ],
  });
  reviewRendition(db, { judgmentId, renditionId, state: "pending" });
  reviewRendition(db, { judgmentId, renditionId, state: "approved" });
  publishRendition(db, { judgmentId, renditionId });
  return { judgmentId, renditionId };
}

describe("공개 그림 신고 대상", () => {
  it("현재 릴리스에 실제로 배치된 그림만 불변 식별자와 함께 찾는다", () => {
    const { judgmentId, renditionId } = publishL4();
    const placement = findCaseMedia("2023다287663", "L4")[0];
    expect(placement).toBeDefined();
    expect(findPublishedMediaReportTarget(db, placement?.id ?? "")).toMatchObject({
      judgmentId,
      renditionId,
      placementId: placement?.id,
      assetId: placement?.assetId,
      recipeKey: placement?.recipeKey,
    });
  });

  it("공개 설명에 해당 제목이 없거나 릴리스에서 철회된 배치는 받지 않는다", () => {
    const { judgmentId } = publishL4();
    const hiddenPlacement = findCaseMedia("2023다287663", "L4")[1];
    expect(findPublishedMediaReportTarget(db, hiddenPlacement?.id ?? "")).toBeUndefined();

    withdrawPublishedRendition(db, { judgmentId, level: "L4" });
    const visiblePlacement = findCaseMedia("2023다287663", "L4")[0];
    expect(findPublishedMediaReportTarget(db, visiblePlacement?.id ?? "")).toBeUndefined();
  });
});
