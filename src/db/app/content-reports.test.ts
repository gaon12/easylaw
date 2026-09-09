import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../client";
import { createTestAppDb } from "../testing";
import {
  createContentReport,
  listContentReports,
  updateContentReportStatus,
} from "./content-reports";
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
  sentenceId: "sentence-id",
  reason: "incorrect" as const,
  detail: "금액이 원문과 달라요.",
};

describe("공개 설명 오류 신고", () => {
  it("정확한 원문판·릴리스·변환본·문장 UUID를 함께 저장한다", () => {
    const saved = createContentReport(db, report);
    expect(saved.duplicate).toBe(false);
    expect(listContentReports(db, 10)[0]).toMatchObject(report);
  });

  it("같은 익명 신고가 열려 있으면 새 행을 만들지 않는다", () => {
    const first = createContentReport(db, report);
    const second = createContentReport(db, { ...report, detail: "다시 제출" });
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(listContentReports(db, 10)).toHaveLength(1);
  });

  it("검수 담당자와 처리 상태를 남긴다", () => {
    const reviewerId = createUser(db, {
      email: "reviewer@example.com",
      passwordHash: "hash",
      role: "reviewer",
    });
    const saved = createContentReport(db, report);
    expect(reviewerId).toBeDefined();
    expect(
      updateContentReportStatus(db, {
        reportId: saved.id,
        status: "resolved",
        handledBy: reviewerId as string,
      }),
    ).toBe(true);
    expect(listContentReports(db, 10)[0]).toMatchObject({
      status: "resolved",
      handledBy: reviewerId,
    });
  });
});
