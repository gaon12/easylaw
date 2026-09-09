import type { CorpusDb } from "@/db/client";
import {
  findJudgmentByCaseNo,
  findPublishedRendition,
  listSentences,
} from "@/db/corpus/repository";
import { findCaseMediaPlacement } from "@/lib/case-media";

/** 배치 ID가 지금 공개 화면에 실제로 나오는 그림인지 확인하고 신고용 불변 식별자를 만든다. */
function findPublishedMediaReportTarget(db: CorpusDb, placementId: string) {
  const placement = findCaseMediaPlacement(placementId);
  if (placement === undefined) {
    return;
  }
  const judgment = findJudgmentByCaseNo(db, placement.caseNo);
  const published =
    judgment === undefined ? undefined : findPublishedRendition(db, judgment.id, placement.level);
  if (
    judgment === undefined ||
    published === undefined ||
    judgment.currentRevisionId === null ||
    judgment.currentContentReleaseId === null ||
    !listSentences(db, published.id).some(
      (sentence) => sentence.role === "heading" && sentence.text === placement.afterHeading,
    )
  ) {
    return;
  }
  return {
    judgmentId: judgment.id,
    sourceRevisionId: judgment.currentRevisionId,
    contentReleaseId: judgment.currentContentReleaseId,
    renditionId: published.id,
    placementId: placement.id,
    assetId: placement.assetId,
    recipeKey: placement.recipeKey,
  };
}

export { findPublishedMediaReportTarget };
