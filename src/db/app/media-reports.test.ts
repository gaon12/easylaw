import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../client";
import { createTestAppDb } from "../testing";
import { createMediaReport, listMediaReports, updateMediaReportStatus } from "./media-reports";
import { createUser } from "./repository";

let db: AppDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestAppDb());
});

afterEach(() => close());

const report = {
  reporterId: null,
  judgmentId: "judgment-id",
  sourceRevisionId: "revision-id",
  contentReleaseId: "release-id",
  renditionId: "rendition-id",
  placementId: "placement-id",
  assetId: "asset-id",
  recipeKey: "MONEY_FINE_001",
  reason: "misleading" as const,
  detail: "돈의 흐름이 반대로 보여요.",
};

describe("공개 설명 그림 오류 신고", () => {
  it("당시 릴리스·배치·자산·레시피 식별자를 함께 저장한다", () => {
    const saved = createMediaReport(db, report);
    expect(saved.duplicate).toBe(false);
    expect(listMediaReports(db, 10)[0]).toMatchObject(report);
  });

  it("같은 익명 신고가 열려 있으면 새 행을 만들지 않는다", () => {
    const first = createMediaReport(db, report);
    const second = createMediaReport(db, { ...report, detail: "다시 제출" });
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(listMediaReports(db, 10)).toHaveLength(1);
  });

  it("검수 담당자와 처리 상태를 남긴다", () => {
    const reviewerId = createUser(db, {
      email: "media-reviewer@example.com",
      passwordHash: "hash",
      role: "reviewer",
    });
    const saved = createMediaReport(db, report);
    expect(reviewerId).toBeDefined();
    expect(
      updateMediaReportStatus(db, {
        reportId: saved.id,
        status: "resolved",
        handledBy: reviewerId as string,
      }),
    ).toBe(true);
    expect(listMediaReports(db, 10)[0]).toMatchObject({
      status: "resolved",
      handledBy: reviewerId,
    });
  });
});
